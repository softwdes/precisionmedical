/**
 * Premios del Staff — la administración (Admin → Premios).
 *
 * Las tablas viven en la base de la CLÍNICA (Phoenix), no en la del Admin: ahí
 * están los usuarios, los pacientes y la actividad que cuenta la meta de uso.
 * El Admin no tiene Prisma que llegue ahí (ver la trampa del `DATABASE_URL`
 * del Admin), así que todo va por REST con la service role del back-office,
 * igual que Métricas.
 *
 * El cálculo del pago NO se hace acá: es `calcularPeriodo`
 * (`@precision-medical/database/premios`), el mismo que usa "Mis premios" en el
 * back-office. Los conteos crudos salen de la misma fn SQL (`reward_progress`).
 *
 * Auditoría: `service_role` no puede escribir `audit_logs` de Phoenix (solo
 * SELECT, medido el 2026-09-29), así que el rastro queda en las propias filas:
 * `createdByUserId` del mes, `reviewedByUserId` + `reviewedAt` de cada
 * registro, y `closedByUserId` al cerrar. Son ids de Phoenix, resueltos por
 * correo, porque los ids del proyecto Admin no existen allá.
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { createClientWithCredentials } from '@precision-medical/auth';
import {
  calcularPeriodo, claveDeMeta, mesTerminado, metaAplica, METAS_POR_DEFECTO, METRICAS, type MetasPersonales,
  type FrozenResult, type GoalKind, type MetricKey, type ProgressRow, type RewardAdjustment, type RewardGoal, type RewardEvidence,
} from '@precision-medical/database/premios';
import { router, adminProcedure } from '../trpc';

function clinica() {
  const url = process.env.BACKOFFICE_SUPABASE_URL;
  const key = process.env.BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('BACKOFFICE_SUPABASE_URL or BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY not set');
  return createClientWithCredentials(url, key);
}

type Db = ReturnType<typeof clinica>;

function falla(message: string): never {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

const Mes = z.string().regex(/^\d{4}-\d{2}$/);
const aPrimerDia = (mes: string) => `${mes}-01`;

function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function nombre(u: { firstName: string | null; lastName: string | null } | undefined): string {
  return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.replace(/\s+/g, ' ').trim() : '—';
}

/** El id de Phoenix de quien opera el Admin (por correo). `null` si no existe. */
async function idClinicaDe(db: Db, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await db.from('users').select('id').ilike('email', email).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

interface GoalRow {
  id: string; sortOrder: number; kind: string; categoryCode: string | null; metric: string | null;
  roleKey: string | null; onlyNew: boolean; target: number; labelEs: string; labelEn: string;
}

async function metasDelPeriodo(db: Db, periodId: string): Promise<RewardGoal[]> {
  const { data, error } = await db.from('reward_goals').select('*').eq('periodId', periodId).order('sortOrder');
  if (error) falla(error.message);
  return ((data ?? []) as GoalRow[]).map((g) => ({ ...g, kind: g.kind as GoalKind, metric: g.metric as MetricKey | null }));
}

interface PartRow {
  userId: string; kind: string; roleKey: string | null;
  approvedAt: string | null; frozenResult: FrozenResult | null;
  targets: MetasPersonales | null;
}

/**
 * El mes calculado: metas, participantes (con lo congelado de quien ya está
 * aprobado), ajustes del Admin y el resultado. Lo usan el Tablero y la
 * aprobación: lo que se aprueba es exactamente lo que el Admin está viendo.
 */
async function calcularMes(db: Db, period: { id: string; poolAmount: number | string }) {
  const [goals, partRes, progRes, adjRes] = await Promise.all([
    metasDelPeriodo(db, period.id),
    db.from('reward_participants').select('userId, kind, roleKey, approvedAt, frozenResult, targets').eq('periodId', period.id),
    db.rpc('reward_progress', { p_period_id: period.id }),
    db.from('reward_adjustments').select('id, userId, goalId, delta, reason, createdAt').eq('periodId', period.id).order('createdAt'),
  ]);
  if (partRes.error) falla(partRes.error.message);
  if (progRes.error) falla(progRes.error.message);
  if (adjRes.error) falla(adjRes.error.message);
  const parts = (partRes.data ?? []) as PartRow[];
  const adjustments = (adjRes.data ?? []) as Array<RewardAdjustment & { createdAt: string }>;
  const calc = calcularPeriodo({
    poolAmount: period.poolAmount,
    goals,
    participants: parts.map((p) => ({
      userId: p.userId, kind: p.kind === 'MANAGER' ? 'MANAGER' : 'STAFF', roleKey: p.roleKey,
      frozenResult: p.approvedAt ? p.frozenResult : null,
      targets: p.targets,
    })),
    progress: (progRes.data ?? []) as unknown as ProgressRow[],
    adjustments,
  });
  return { goals, parts, adjustments, calc };
}

async function periodoAbierto(db: Db, periodId: string) {
  const { data, error } = await db.from('reward_periods').select('id, month, status, poolAmount').eq('id', periodId).maybeSingle();
  if (error) falla(error.message);
  const p = data as { id: string; month: string; status: string; poolAmount: number | string } | null;
  if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
  if (p.status !== 'OPEN') throw new TRPCError({ code: 'CONFLICT', message: 'PERIOD_CLOSED' });
  return p;
}

const GoalInput = z.object({
  kind: z.enum(['CATEGORY', 'CALLS', 'USAGE', 'METRIC']),
  categoryCode: z.string().nullish(),
  metric: z.enum(Object.keys(METRICAS) as [MetricKey, ...MetricKey[]]).nullish(),
  // Rol al que aplica la meta; vacío = a todos.
  roleKey: z.string().trim().max(40).nullish(),
  onlyNew: z.boolean().default(false),
  target: z.number().int().min(1).max(100000),
  labelEs: z.string().trim().min(1).max(80),
  labelEn: z.string().trim().min(1).max(80),
});

export const premiosRouter = router({
  /**
   * El mes con el que abre la pantalla cuando la URL no dice cuál.
   *
   * Si ya hay un mes ABIERTO posterior al actual, se abre ESE: se arma octubre
   * antes del 1 y la pantalla tiene que mostrar lo que se está armando, no el mes
   * que termina. El 30-sep (todavía septiembre en Utah) la pantalla abría en
   * septiembre, y ahí se cargó por error a toda la gente de octubre.
   * Si no hay ninguno posterior, abre el mes actual.
   */
  defaultMonth: adminProcedure
    .input(z.object({ current: Mes }))
    .query(async ({ input }) => {
      const db = clinica();
      const { data } = await db.from('reward_periods').select('month')
        .eq('status', 'OPEN').gt('month', aPrimerDia(input.current))
        .order('month', { ascending: false }).limit(1);
      const prox = (data?.[0] as { month: string } | undefined)?.month;
      return { month: prox ? prox.slice(0, 7) : input.current };
    }),

  /**
   * Todo lo que necesitan las pestañas Mes y Tablero para un mes: el período
   * (si existe), sus metas y participantes con el cálculo ya hecho, el
   * catálogo, y —si el mes todavía no existe— las metas del mes anterior para
   * proponerlas.
   */
  overview: adminProcedure
    .input(z.object({ month: Mes }))
    .query(async ({ input }) => {
      const db = clinica();
      const [perRes, catRes] = await Promise.all([
        db.from('reward_periods').select('*').eq('month', aPrimerDia(input.month)).maybeSingle(),
        db.from('reward_categories').select('*').order('sortOrder'),
      ]);
      if (perRes.error) falla(perRes.error.message);
      if (catRes.error) falla(catRes.error.message);
      const categories = catRes.data ?? [];
      const period = perRes.data as null | {
        id: string; month: string; poolAmount: number | string; status: string;
        closedAt: string | null; createdAt: string;
      };

      if (!period) {
        // Mes nuevo: se proponen las metas del mes anterior, o las por defecto.
        const prev = await db.from('reward_periods').select('id, poolAmount')
          .eq('month', aPrimerDia(mesAnterior(input.month))).maybeSingle();
        let goals: Array<Omit<RewardGoal, 'id'>> = METAS_POR_DEFECTO;
        let poolAmount: number | null = null;
        let participants: Array<{ userId: string; kind: string; roleKey?: string | null }> = [];
        if (prev.data) {
          const prevGoals = await metasDelPeriodo(db, (prev.data as { id: string }).id);
          // Las metas manuales (categorías) ya no se usan: un mes viejo que las tenga
          // no se copia, y se proponen las automáticas por defecto. Copiar solo las
          // automáticas dejaría un mes con una o dos metas sueltas.
          if (prevGoals.length && prevGoals.every((g) => g.kind !== 'CATEGORY')) goals = prevGoals.map(({ id: _id, ...g }) => g);
          poolAmount = Number((prev.data as { poolAmount: number | string }).poolAmount);
          const pp = await db.from('reward_participants').select('userId, kind, roleKey').eq('periodId', (prev.data as { id: string }).id);
          participants = (pp.data ?? []) as Array<{ userId: string; kind: string; roleKey?: string | null }>;
        }
        return {
          month: input.month, period: null, categories,
          proposal: { goals, poolAmount, participants, copiedFrom: prev.data ? mesAnterior(input.month) : null },
          goals: [] as RewardGoal[], participants: [], summary: null, pendingCount: 0,
        };
      }

      const [{ goals, parts, adjustments, calc }, pendRes] = await Promise.all([
        calcularMes(db, period),
        db.from('reward_entries').select('id', { count: 'exact', head: true }).eq('periodId', period.id).eq('status', 'PENDING'),
      ]);

      const usersRes = parts.length
        ? await db.from('users').select('id, firstName, lastName').in('id', parts.map((p) => p.userId))
        : { data: [], error: null };
      const porId = new Map(((usersRes.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>).map((u) => [u.id, u]));

      return {
        month: input.month,
        period: { ...period, poolAmount: Number(period.poolAmount) },
        categories,
        proposal: null,
        goals,
        participants: calc.participants
          .map((r) => ({
            userId: r.userId, name: nombre(porId.get(r.userId)), kind: r.kind, roleKey: r.roleKey, result: r,
            approvedAt: parts.find((p) => p.userId === r.userId)?.approvedAt ?? null,
            targets: parts.find((p) => p.userId === r.userId)?.targets ?? null,
          }))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'STAFF' ? -1 : 1)),
        summary: {
          shareCents: calc.shareCents, poolCents: calc.poolCents, paidCents: calc.paidCents,
          returnedCents: calc.returnedCents, staffHits: calc.staffHits, staffTotal: calc.staffTotal,
        },
        pendingCount: pendRes.count ?? 0,
        adjustments,
        /** Recién terminado el mes se puede aprobar (en Utah). */
        monthEnded: mesTerminado(period.month),
      };
    }),

  /**
   * Ajustar una meta de alguien en la revisión: +/− sobre lo que contó el
   * sistema, con motivo (el empleado lo ve). Solo a quien todavía no está
   * aprobado: lo aprobado no se mueve.
   */
  adjust: adminProcedure
    .input(z.object({
      periodId: z.string().min(1), userId: z.string().min(1), goalId: z.string().min(1),
      delta: z.number().int().min(-1000).max(1000).refine((d) => d !== 0),
      reason: z.string().trim().min(3).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = clinica();
      await periodoAbierto(db, input.periodId);
      const part = await db.from('reward_participants').select('approvedAt').eq('periodId', input.periodId).eq('userId', input.userId).maybeSingle();
      if (!part.data) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
      if ((part.data as { approvedAt: string | null }).approvedAt) throw new TRPCError({ code: 'CONFLICT', message: 'ALREADY_APPROVED' });
      const actorId = await idClinicaDe(db, ctx.user.email);
      const ins = await db.from('reward_adjustments').insert({
        id: randomUUID(), periodId: input.periodId, userId: input.userId, goalId: input.goalId,
        delta: input.delta, reason: input.reason, createdByUserId: actorId, createdAt: new Date().toISOString(),
      });
      if (ins.error) falla(ins.error.message);
      return { ok: true };
    }),

  /**
   * Las metas propias de una persona (Erick, 2026-10-03): cada uno corre contra
   * sí mismo. Por clave de meta (`claveDeMeta`): un número reemplaza la del rol,
   * `null` la saca ("no aplica"). Lo que no se manda vuelve a la del rol.
   */
  setTargets: adminProcedure
    .input(z.object({
      periodId: z.string().min(1), userId: z.string().min(1),
      targets: z.record(z.string().min(1).max(60), z.number().int().min(1).max(100000).nullable()),
    }))
    .mutation(async ({ input }) => {
      const db = clinica();
      await periodoAbierto(db, input.periodId);
      const part = await db.from('reward_participants').select('kind, roleKey, approvedAt').eq('periodId', input.periodId).eq('userId', input.userId).maybeSingle();
      if (!part.data) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
      const p = part.data as { kind: string; roleKey: string | null; approvedAt: string | null };
      if (p.approvedAt) throw new TRPCError({ code: 'CONFLICT', message: 'ALREADY_APPROVED' });
      // Solo claves de metas que le tocan: lo demás no tendría efecto y confundiría.
      const goals = await metasDelPeriodo(db, input.periodId);
      const validas = new Set(goals.filter((g) => metaAplica(g, p.roleKey)).map(claveDeMeta));
      const targets: MetasPersonales = {};
      for (const [k, v] of Object.entries(input.targets)) {
        if (!validas.has(k)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'GOAL_NOT_IN_ROLE' });
        targets[k] = v;
      }
      const up = await db.from('reward_participants')
        .update({ targets: Object.keys(targets).length ? targets : null })
        .eq('periodId', input.periodId).eq('userId', input.userId);
      if (up.error) falla(up.error.message);
      return { ok: true };
    }),

  /** Quitar un ajuste (mientras la persona no esté aprobada). */
  removeAdjustment: adminProcedure
    .input(z.object({ adjustmentId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = clinica();
      const adj = await db.from('reward_adjustments').select('periodId, userId').eq('id', input.adjustmentId).maybeSingle();
      if (!adj.data) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
      const a = adj.data as { periodId: string; userId: string };
      await periodoAbierto(db, a.periodId);
      const part = await db.from('reward_participants').select('approvedAt').eq('periodId', a.periodId).eq('userId', a.userId).maybeSingle();
      if ((part.data as { approvedAt: string | null } | null)?.approvedAt) throw new TRPCError({ code: 'CONFLICT', message: 'ALREADY_APPROVED' });
      const del = await db.from('reward_adjustments').delete().eq('id', input.adjustmentId);
      if (del.error) falla(del.error.message);
      return { ok: true };
    }),

  /**
   * Aprobar a una o varias personas (o a todas). Congela su resultado tal como
   * se ve en el Tablero. Reglas:
   *   · solo con el mes terminado (lo que hagan hasta el último día cuenta);
   *   · los supervisores, después de todo el staff: su monto sale del staff;
   *   · con todos aprobados, el mes se cierra.
   */
  approve: adminProcedure
    .input(z.object({ periodId: z.string().min(1), userIds: z.array(z.string().min(1)).min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const db = clinica();
      const period = await periodoAbierto(db, input.periodId);
      if (!mesTerminado(period.month)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'MONTH_NOT_ENDED' });
      const { parts, calc } = await calcularMes(db, period);
      const pedidos = new Set(input.userIds);
      const staffPendiente = parts.filter((p) => p.kind !== 'MANAGER' && !p.approvedAt && !pedidos.has(p.userId));
      const pideSupervisor = parts.some((p) => p.kind === 'MANAGER' && pedidos.has(p.userId));
      if (pideSupervisor && staffPendiente.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'STAFF_FIRST' });

      const actorId = await idClinicaDe(db, ctx.user.email);
      const ahora = new Date().toISOString();
      for (const r of calc.participants) {
        if (!pedidos.has(r.userId) || r.approved) continue;
        const { approved: _a, ...frozen } = r;
        const up = await db.from('reward_participants').update({
          approvedAt: ahora, approvedByUserId: actorId, frozenResult: frozen,
          shareAmount: calc.shareCents / 100, goalsHit: r.goalsHit, goalsTotal: r.goalsTotal,
          progressPct: Math.round(r.progress * 10000) / 10000, payoutAmount: r.payoutCents / 100,
        }).eq('periodId', period.id).eq('userId', r.userId).is('approvedAt', null);
        if (up.error) falla(up.error.message);
      }

      // ¿Quedó todo aprobado? Se cierra el mes.
      const quedan = await db.from('reward_participants').select('userId', { count: 'exact', head: true }).eq('periodId', period.id).is('approvedAt', null);
      if ((quedan.count ?? 1) === 0) {
        const cl = await db.from('reward_periods').update({ status: 'CLOSED', closedAt: ahora, closedByUserId: actorId, updatedAt: ahora }).eq('id', period.id);
        if (cl.error) falla(cl.error.message);
        return { ok: true, closed: true };
      }
      return { ok: true, closed: false };
    }),

  /**
   * Deshacer una aprobación (mientras el mes no esté cerrado). Si es de staff,
   * se deshacen también los supervisores: su monto dependía de ese resultado.
   */
  unapprove: adminProcedure
    .input(z.object({ periodId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = clinica();
      await periodoAbierto(db, input.periodId);
      const p = await db.from('reward_participants').select('kind').eq('periodId', input.periodId).eq('userId', input.userId).maybeSingle();
      if (!p.data) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
      const limpiar = { approvedAt: null, approvedByUserId: null, frozenResult: null, shareAmount: null, goalsHit: null, goalsTotal: null, progressPct: null, payoutAmount: null };
      const r1 = await db.from('reward_participants').update(limpiar).eq('periodId', input.periodId).eq('userId', input.userId);
      if (r1.error) falla(r1.error.message);
      if ((p.data as { kind: string }).kind !== 'MANAGER') {
        const r2 = await db.from('reward_participants').update(limpiar).eq('periodId', input.periodId).eq('kind', 'MANAGER');
        if (r2.error) falla(r2.error.message);
      }
      return { ok: true };
    }),

  /** La gente que se puede sumar a un mes: usuarios activos de la clínica. */
  candidates: adminProcedure.query(async () => {
    const db = clinica();
    const { data, error } = await db.from('users')
      .select('id, firstName, lastName, role')
      .is('deletedAt', null)
      // Los doctores entran (Erick, 30-sep: Devin participa como staff); los
      // abogados, el auditor de IA y los proveedores externos, no.
      .not('role', 'in', '("LAWYER","AUDITOR_AI","PROVIDER")')
      .order('firstName');
    if (error) falla(error.message);
    return ((data ?? []) as Array<{ id: string; firstName: string; lastName: string; role: string }>)
      .map((u) => ({ id: u.id, name: nombre(u), role: u.role }));
  }),

  /**
   * Abrir o editar un mes: bolsa, participantes y metas.
   *
   * Solo mientras está ABIERTO. Las metas se reemplazan enteras (los registros
   * cuelgan del mes, no de las metas, así que no se pierde nada), y los
   * participantes se sincronizan: quien sale del mes conserva sus registros,
   * pero deja de contar.
   */
  savePeriod: adminProcedure
    .input(z.object({
      month: Mes,
      poolAmount: z.number().min(0).max(1_000_000),
      participants: z.array(z.object({
        userId: z.string().min(1), kind: z.enum(['STAFF', 'MANAGER']),
        roleKey: z.string().trim().max(40).nullish(),
      })).min(2).max(60),
      goals: z.array(GoalInput).min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = clinica();
      const ids = input.participants.map((p) => p.userId);
      if (new Set(ids).size !== ids.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'DUPLICATE_PARTICIPANT' });
      // Puede haber más de una manager (Erick, 30-sep: Beatriz y Roger). Cada una
      // cobra su parte según el promedio del staff; `calcularPeriodo` ya lo resuelve.
      if (!input.participants.some((p) => p.kind === 'STAFF')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'STAFF_REQUIRED' });
      }
      for (const g of input.goals) {
        if ((g.kind === 'CATEGORY') !== !!g.categoryCode) throw new TRPCError({ code: 'BAD_REQUEST', message: 'GOAL_CATEGORY_MISMATCH' });
        if ((g.kind === 'METRIC') !== !!g.metric) throw new TRPCError({ code: 'BAD_REQUEST', message: 'GOAL_CATEGORY_MISMATCH' });
        // Lo "próximamente" se muestra, pero todavía no puede ser una meta.
        if (g.metric && METRICAS[g.metric].comingSoon) throw new TRPCError({ code: 'BAD_REQUEST', message: 'METRIC_COMING_SOON' });
      }

      const actorId = await idClinicaDe(db, ctx.user.email);
      const month = aPrimerDia(input.month);
      const ahora = new Date().toISOString();

      const existing = await db.from('reward_periods').select('id, status').eq('month', month).maybeSingle();
      if (existing.error) falla(existing.error.message);
      let periodId: string;
      let nuevo = false;
      if (existing.data) {
        const p = existing.data as { id: string; status: string };
        if (p.status !== 'OPEN') throw new TRPCError({ code: 'CONFLICT', message: 'PERIOD_CLOSED' });
        periodId = p.id;
        const up = await db.from('reward_periods').update({ poolAmount: input.poolAmount, updatedAt: ahora }).eq('id', periodId);
        if (up.error) falla(up.error.message);
      } else {
        periodId = randomUUID();
        nuevo = true;
        const ins = await db.from('reward_periods').insert({
          id: periodId, month, poolAmount: input.poolAmount, status: 'OPEN',
          createdByUserId: actorId, createdAt: ahora, updatedAt: ahora,
        });
        if (ins.error) falla(ins.error.message);
      }

      // Participantes: sacar los que ya no están, y upsert del resto.
      const actuales = await db.from('reward_participants').select('userId').eq('periodId', periodId);
      const quedan = new Set(ids);
      const salen = ((actuales.data ?? []) as Array<{ userId: string }>).map((r) => r.userId).filter((u) => !quedan.has(u));
      if (salen.length) {
        const del = await db.from('reward_participants').delete().eq('periodId', periodId).in('userId', salen);
        if (del.error) falla(del.error.message);
      }
      const up = await db.from('reward_participants').upsert(
        input.participants.map((p) => ({ id: randomUUID(), periodId, userId: p.userId, kind: p.kind, roleKey: p.roleKey || null })),
        { onConflict: 'periodId,userId', ignoreDuplicates: false },
      );
      // El upsert con id nuevo pisa el id de la fila existente: da igual, nadie
      // referencia `reward_participants.id`.
      if (up.error) falla(up.error.message);

      // Metas: se reemplazan enteras.
      const delG = await db.from('reward_goals').delete().eq('periodId', periodId);
      if (delG.error) falla(delG.error.message);
      const insG = await db.from('reward_goals').insert(input.goals.map((g, i) => ({
        id: randomUUID(), periodId, sortOrder: i + 1, kind: g.kind,
        categoryCode: g.kind === 'CATEGORY' ? g.categoryCode : null,
        metric: g.kind === 'METRIC' ? g.metric : null,
        roleKey: g.roleKey || null,
        onlyNew: g.kind === 'CATEGORY' ? g.onlyNew : false,
        target: g.target, labelEs: g.labelEs, labelEn: g.labelEn,
      })));
      if (insG.error) falla(insG.error.message);

      // Mes nuevo: las metas propias se copian del mes anterior, para quien
      // repite con el mismo rol. Las claves no dependen del id de la meta.
      if (nuevo) {
        const prev = await db.from('reward_periods').select('id').eq('month', aPrimerDia(mesAnterior(input.month))).maybeSingle();
        if (prev.data) {
          const pp = await db.from('reward_participants').select('userId, roleKey, targets')
            .eq('periodId', (prev.data as { id: string }).id).not('targets', 'is', null);
          for (const r of (pp.data ?? []) as Array<{ userId: string; roleKey: string | null; targets: MetasPersonales }>) {
            const ahora = input.participants.find((p) => p.userId === r.userId);
            if (!ahora || (ahora.roleKey || null) !== r.roleKey) continue;
            const cp = await db.from('reward_participants').update({ targets: r.targets }).eq('periodId', periodId).eq('userId', r.userId);
            if (cp.error) falla(cp.error.message);
          }
        }
      }

      return { periodId };
    }),

  /** La cola de "Verificar": los registros PENDIENTES del mes. */
  pending: adminProcedure
    .input(z.object({ periodId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = clinica();
      const { data, error } = await db.from('reward_entries')
        .select('id, userId, categoryCode, occurredOn, patientId, source, isNewPatient, points, notes, createdAt')
        .eq('periodId', input.periodId).eq('status', 'PENDING')
        .order('occurredOn', { ascending: true });
      if (error) falla(error.message);
      const rows = (data ?? []) as Array<{
        id: string; userId: string; categoryCode: string; occurredOn: string; patientId: string | null;
        source: string | null; isNewPatient: boolean | null; points: number; notes: string | null; createdAt: string;
      }>;
      const userIds = [...new Set(rows.map((r) => r.userId))];
      const patIds = [...new Set(rows.map((r) => r.patientId).filter((x): x is string => !!x))];
      const [us, ps, ev] = await Promise.all([
        userIds.length ? db.from('users').select('id, firstName, lastName').in('id', userIds) : Promise.resolve({ data: [] }),
        patIds.length ? db.from('patients').select('id, patientCode, firstName, lastName').in('id', patIds) : Promise.resolve({ data: [] }),
        // Lo que el sistema sabe de cada registro, para comparar con lo declarado.
        // Si la fn falla, la cola se muestra igual, sin la comparación: verificar
        // a mano sigue siendo posible y no puede quedar bloqueado por esto.
        rows.length ? db.rpc('reward_evidence', { p_period_id: input.periodId }) : Promise.resolve({ data: [], error: null }),
      ]);
      const evPor = new Map(((ev.error ? [] : ev.data ?? []) as unknown as RewardEvidence[]).map((x) => [x.entryId, x]));
      const uPor = new Map(((us.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>).map((u) => [u.id, u]));
      // Parte de la data migrada sigue cifrada (`e:…`) y el Admin no descifra:
      // en ese caso se muestra solo el código, que es lo que identifica al paciente.
      const legible = (s: string | null) => (s && !s.startsWith('e:') ? s : '');
      const pPor = new Map(((ps.data ?? []) as Array<{ id: string; patientCode: string | null; firstName: string | null; lastName: string | null }>)
        .map((p) => [p.id, { code: p.patientCode, name: `${legible(p.firstName)} ${legible(p.lastName)}`.trim() }]));
      return rows.map((r) => ({
        ...r,
        userName: nombre(uPor.get(r.userId)),
        patient: r.patientId ? (pPor.get(r.patientId) ?? { code: null, name: '' }) : null,
        evidence: evPor.get(r.id) ?? null,
      }));
    }),

  /** Aprobar o rechazar un registro. Rechazar pide motivo: el empleado lo ve. */
  review: adminProcedure
    .input(z.object({
      entryId: z.string().min(1),
      decision: z.enum(['VERIFIED', 'REJECTED']),
      reason: z.string().trim().max(200).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.decision === 'REJECTED' && !input.reason) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'REASON_REQUIRED' });
      }
      const db = clinica();
      const entry = await db.from('reward_entries').select('id, status, periodId').eq('id', input.entryId).maybeSingle();
      if (entry.error) falla(entry.error.message);
      if (!entry.data) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
      const e = entry.data as { id: string; status: string; periodId: string };
      const per = await db.from('reward_periods').select('status').eq('id', e.periodId).maybeSingle();
      if ((per.data as { status: string } | null)?.status !== 'OPEN') throw new TRPCError({ code: 'CONFLICT', message: 'PERIOD_CLOSED' });

      const actorId = await idClinicaDe(db, ctx.user.email);
      const ahora = new Date().toISOString();
      // `.eq('status', 'PENDING')`: si dos admins verifican a la vez, el segundo no pisa al primero.
      const { data, error } = await db.from('reward_entries').update({
        status: input.decision,
        rejectReason: input.decision === 'REJECTED' ? input.reason : null,
        reviewedByUserId: actorId, reviewedAt: ahora, updatedAt: ahora,
      }).eq('id', e.id).eq('status', 'PENDING').select('id');
      if (error) falla(error.message);
      if (!data?.length) throw new TRPCError({ code: 'CONFLICT', message: 'ALREADY_REVIEWED' });
      return { ok: true };
    }),
});
