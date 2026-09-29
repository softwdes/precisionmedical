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
  calcularPeriodo, METAS_POR_DEFECTO, type GoalKind, type ProgressRow, type RewardGoal,
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
  id: string; sortOrder: number; kind: string; categoryCode: string | null;
  onlyNew: boolean; target: number; labelEs: string; labelEn: string;
}

async function metasDelPeriodo(db: Db, periodId: string): Promise<RewardGoal[]> {
  const { data, error } = await db.from('reward_goals').select('*').eq('periodId', periodId).order('sortOrder');
  if (error) falla(error.message);
  return ((data ?? []) as GoalRow[]).map((g) => ({ ...g, kind: g.kind as GoalKind }));
}

const GoalInput = z.object({
  kind: z.enum(['CATEGORY', 'CALLS', 'USAGE']),
  categoryCode: z.string().nullish(),
  onlyNew: z.boolean().default(false),
  target: z.number().int().min(1).max(100000),
  labelEs: z.string().trim().min(1).max(80),
  labelEn: z.string().trim().min(1).max(80),
});

export const premiosRouter = router({
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
        let participants: Array<{ userId: string; kind: string }> = [];
        if (prev.data) {
          const prevGoals = await metasDelPeriodo(db, (prev.data as { id: string }).id);
          if (prevGoals.length) goals = prevGoals.map(({ id: _id, ...g }) => g);
          poolAmount = Number((prev.data as { poolAmount: number | string }).poolAmount);
          const pp = await db.from('reward_participants').select('userId, kind').eq('periodId', (prev.data as { id: string }).id);
          participants = (pp.data ?? []) as Array<{ userId: string; kind: string }>;
        }
        return {
          month: input.month, period: null, categories,
          proposal: { goals, poolAmount, participants, copiedFrom: prev.data ? mesAnterior(input.month) : null },
          goals: [] as RewardGoal[], participants: [], summary: null, pendingCount: 0,
        };
      }

      const [goals, partRes, progRes, pendRes] = await Promise.all([
        metasDelPeriodo(db, period.id),
        db.from('reward_participants').select('userId, kind').eq('periodId', period.id),
        db.rpc('reward_progress', { p_period_id: period.id }),
        db.from('reward_entries').select('id', { count: 'exact', head: true }).eq('periodId', period.id).eq('status', 'PENDING'),
      ]);
      if (partRes.error) falla(partRes.error.message);
      if (progRes.error) falla(progRes.error.message);
      const parts = (partRes.data ?? []) as Array<{ userId: string; kind: string }>;

      const usersRes = parts.length
        ? await db.from('users').select('id, firstName, lastName').in('id', parts.map((p) => p.userId))
        : { data: [], error: null };
      const porId = new Map(((usersRes.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>).map((u) => [u.id, u]));

      const calc = calcularPeriodo({
        poolAmount: period.poolAmount,
        goals,
        participants: parts.map((p) => ({ userId: p.userId, kind: p.kind === 'MANAGER' ? 'MANAGER' : 'STAFF' })),
        progress: (progRes.data ?? []) as unknown as ProgressRow[],
      });

      return {
        month: input.month,
        period: { ...period, poolAmount: Number(period.poolAmount) },
        categories,
        proposal: null,
        goals,
        participants: calc.participants
          .map((r) => ({ userId: r.userId, name: nombre(porId.get(r.userId)), kind: r.kind, result: r }))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'STAFF' ? -1 : 1)),
        summary: {
          shareCents: calc.shareCents, poolCents: calc.poolCents, paidCents: calc.paidCents,
          returnedCents: calc.returnedCents, staffHits: calc.staffHits, staffTotal: calc.staffTotal,
        },
        pendingCount: pendRes.count ?? 0,
      };
    }),

  /** La gente que se puede sumar a un mes: usuarios activos de la clínica. */
  candidates: adminProcedure.query(async () => {
    const db = clinica();
    const { data, error } = await db.from('users')
      .select('id, firstName, lastName, role')
      .is('deletedAt', null)
      // Sin providers: los premios son del staff del back-office.
      .not('role', 'in', '("LAWYER","AUDITOR_AI","DOCTOR","PROVIDER")')
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
      participants: z.array(z.object({ userId: z.string().min(1), kind: z.enum(['STAFF', 'MANAGER']) })).min(2).max(60),
      goals: z.array(GoalInput).min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = clinica();
      const ids = input.participants.map((p) => p.userId);
      if (new Set(ids).size !== ids.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'DUPLICATE_PARTICIPANT' });
      if (input.participants.filter((p) => p.kind === 'MANAGER').length > 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ONE_MANAGER_MAX' });
      }
      if (!input.participants.some((p) => p.kind === 'STAFF')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'STAFF_REQUIRED' });
      }
      for (const g of input.goals) {
        if ((g.kind === 'CATEGORY') !== !!g.categoryCode) throw new TRPCError({ code: 'BAD_REQUEST', message: 'GOAL_CATEGORY_MISMATCH' });
      }

      const actorId = await idClinicaDe(db, ctx.user.email);
      const month = aPrimerDia(input.month);
      const ahora = new Date().toISOString();

      const existing = await db.from('reward_periods').select('id, status').eq('month', month).maybeSingle();
      if (existing.error) falla(existing.error.message);
      let periodId: string;
      if (existing.data) {
        const p = existing.data as { id: string; status: string };
        if (p.status !== 'OPEN') throw new TRPCError({ code: 'CONFLICT', message: 'PERIOD_CLOSED' });
        periodId = p.id;
        const up = await db.from('reward_periods').update({ poolAmount: input.poolAmount, updatedAt: ahora }).eq('id', periodId);
        if (up.error) falla(up.error.message);
      } else {
        periodId = randomUUID();
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
        input.participants.map((p) => ({ id: randomUUID(), periodId, userId: p.userId, kind: p.kind })),
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
        onlyNew: g.kind === 'CATEGORY' ? g.onlyNew : false,
        target: g.target, labelEs: g.labelEs, labelEn: g.labelEn,
      })));
      if (insG.error) falla(insG.error.message);

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
      const [us, ps] = await Promise.all([
        userIds.length ? db.from('users').select('id, firstName, lastName').in('id', userIds) : Promise.resolve({ data: [] }),
        patIds.length ? db.from('patients').select('id, patientCode, firstName, lastName').in('id', patIds) : Promise.resolve({ data: [] }),
      ]);
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
