/**
 * Premios del Staff — el lado del back-office.
 *
 * Acá solo se LEE y se ARMA: los conteos salen de la fn SQL `reward_progress` y
 * el pago de `calcularPeriodo` (`@precision-medical/database/premios`), que es
 * el mismo cálculo que usa el Admin. Si "Mis premios" y el Tablero del Admin
 * dieran números distintos, el problema estaría en uno de esos dos lugares, no
 * en esta pantalla.
 *
 * Privacidad (Erick, 2026-09-28): cada empleado ve SOLO lo suyo. La manager ve
 * además el avance de su equipo, porque de eso depende su porcentaje. Lo que no
 * sale de esta capa no se puede mostrar mal en el cliente: `misPremios` arma el
 * equipo únicamente cuando quien pregunta es MANAGER.
 */

import { cache } from 'react';
import { db, VIGENTES, AppointmentStatus } from '@precision-medical/database';
import {
  calcularPeriodo, mesDe, type FrozenResult, type MetasPersonales, type ProgressRow, type RewardGoal, type GoalKind, type MetricKey,
  type ParticipantResult,
} from '@precision-medical/database/premios';
import { decryptFieldOrOriginal as dec } from './decrypt';
import { getSessionUser } from './session';
import { getDbUserByEmail } from './actor';
import { ZONA_CLINICA } from './fechas';

/** `2026-10-01` → la fecha que Prisma guarda en una columna `DATE`. */
export function fechaDeMes(mes: string): Date {
  return new Date(`${mes}T00:00:00Z`);
}

/** El mes de la clínica que corre hoy, como `YYYY-MM-01`. */
export function mesActual(): string {
  return mesDe(new Date(), ZONA_CLINICA);
}

/**
 * La participación de alguien en el mes que corre: el período, si está
 * abierto, y su fila de participante. `null` si no juega este mes.
 *
 * Memorizada por request: la pide el layout (para el menú) y la página.
 */
export const participacionActual = cache(async (userId: string) => {
  const period = await db.rewardPeriod.findUnique({ where: { month: fechaDeMes(mesActual()) } });
  if (!period) return null;
  const participant = await db.rewardParticipant.findUnique({
    where: { periodId_userId: { periodId: period.id, userId } },
  });
  if (!participant) return null;
  return { period, participant };
});

/** El mes de la clínica anterior al actual, `YYYY-MM-01`. */
export function mesAnterior(): string {
  const [y, m] = mesActual().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

/**
 * La participación en el mes ANTERIOR. Hace falta porque el mes se aprueba
 * después de terminar: el resultado de octubre se revisa y se aprueba en
 * noviembre, y "Mis premios" tiene que mostrarlo ("En revisión" → "Aprobado").
 */
export const participacionAnterior = cache(async (userId: string) => {
  const period = await db.rewardPeriod.findUnique({ where: { month: fechaDeMes(mesAnterior()) } });
  if (!period) return null;
  const participant = await db.rewardParticipant.findUnique({
    where: { periodId_userId: { periodId: period.id, userId } },
  });
  if (!participant) return null;
  return { period, participant };
});

/** ¿Va "Mis premios" en el menú? Para quien participa este mes o el anterior. */
export const canSeeRewards = cache(async (): Promise<boolean> => {
  try {
    const user = await getSessionUser();
    if (!user?.email) return false;
    const dbUser = await getDbUserByEmail(user.email);
    if (!dbUser) return false;
    return (await participacionActual(dbUser.id)) !== null || (await participacionAnterior(dbUser.id)) !== null;
  } catch {
    // Ante la duda no se muestra: el menú no puede tirar el layout entero.
    return false;
  }
});

async function progresoDelPeriodo(periodId: string): Promise<ProgressRow[]> {
  // String plano y `$queryRawUnsafe`, igual que la Carrera: interpolar un
  // fragmento `Prisma.sql` falla en silencio en `next dev`.
  const filas = await db.$queryRawUnsafe<Array<{ p: unknown }>>(
    'SELECT reward_progress($1) AS p', periodId,
  );
  return (filas[0]?.p as ProgressRow[] | undefined) ?? [];
}

function metasDe(goals: Array<{
  id: string; sortOrder: number; kind: string; categoryCode: string | null; metric: string | null;
  roleKey: string | null; onlyNew: boolean; target: number; labelEs: string; labelEn: string;
}>): RewardGoal[] {
  return goals.map((g) => ({ ...g, kind: g.kind as GoalKind, metric: g.metric as MetricKey | null }));
}

function nombreDe(u: { firstName: string; lastName: string } | undefined): string {
  return u ? `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').trim() : '—';
}

export interface MisPremios {
  month: string;
  status: string;
  /** Aprobado por el Admin: el monto ya no se mueve. */
  approved: boolean;
  /** Ajustes del Admin sobre sus metas, con el motivo. */
  adjustments: Array<{ goalId: string; delta: number; reason: string }>;
  poolCents: number;
  shareCents: number;
  participantsCount: number;
  me: ParticipantResult;
  goals: RewardGoal[];
  entries: Array<{
    id: string;
    occurredOn: string;
    categoryCode: string;
    patient: { code: string | null; name: string } | null;
    source: string | null;
    isNewPatient: boolean | null;
    points: number;
    status: string;
    rejectReason: string | null;
    origin: string;
  }>;
  /** Solo si quien pregunta es MANAGER. */
  team: Array<{ userId: string; name: string; result: ParticipantResult }> | null;
}

/**
 * "Mis premios" de un mes: el actual por defecto, o `'anterior'` para el que
 * está en revisión o ya aprobado.
 */
export async function misPremios(userId: string, cual: 'actual' | 'anterior' = 'actual'): Promise<MisPremios | null> {
  const part = cual === 'actual' ? await participacionActual(userId) : await participacionAnterior(userId);
  if (!part) return null;
  const { period, participant } = part;

  const [goals, participants, progress, entries, adjustments] = await Promise.all([
    db.rewardGoal.findMany({ where: { periodId: period.id }, orderBy: { sortOrder: 'asc' } }),
    db.rewardParticipant.findMany({
      where: { periodId: period.id },
      select: { userId: true, kind: true, roleKey: true, approvedAt: true, frozenResult: true, targets: true },
    }),
    progresoDelPeriodo(period.id),
    db.rewardEntry.findMany({
      where: { periodId: period.id, userId },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    db.rewardAdjustment.findMany({ where: { periodId: period.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  const metas = metasDe(goals);
  const calc = calcularPeriodo({
    poolAmount: period.poolAmount.toString(),
    goals: metas,
    participants: participants.map((p) => ({
      userId: p.userId, kind: p.kind === 'MANAGER' ? 'MANAGER' : 'STAFF', roleKey: p.roleKey,
      frozenResult: p.approvedAt ? (p.frozenResult as unknown as FrozenResult | null) : null,
      targets: p.targets as MetasPersonales | null,
    })),
    progress,
    adjustments,
  });
  const me = calc.participants.find((p) => p.userId === userId);
  if (!me) return null;

  const patientIds = [...new Set(entries.map((e) => e.patientId).filter((x): x is string => !!x))];
  const pacientes = patientIds.length
    ? await db.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, patientCode: true, firstName: true, lastName: true },
      })
    : [];
  const pacPorId = new Map(pacientes.map((p) => [p.id, {
    code: p.patientCode,
    name: `${dec(p.firstName) ?? ''} ${dec(p.lastName) ?? ''}`.trim(),
  }]));

  let team: MisPremios['team'] = null;
  if (participant.kind === 'MANAGER') {
    const staff = calc.participants.filter((p) => p.kind === 'STAFF');
    const users = await db.user.findMany({
      where: { id: { in: staff.map((s) => s.userId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const porId = new Map(users.map((u) => [u.id, u]));
    team = staff
      .map((s) => ({ userId: s.userId, name: nombreDe(porId.get(s.userId)), result: s }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    month: period.month.toISOString().slice(0, 10),
    status: period.status,
    approved: me.approved,
    adjustments: adjustments.filter((a) => a.userId === userId).map((a) => ({ goalId: a.goalId, delta: a.delta, reason: a.reason })),
    poolCents: calc.poolCents,
    shareCents: calc.shareCents,
    participantsCount: participants.length,
    me,
    goals: metas,
    entries: entries.map((e) => ({
      id: e.id,
      occurredOn: e.occurredOn.toISOString().slice(0, 10),
      categoryCode: e.categoryCode,
      patient: e.patientId ? (pacPorId.get(e.patientId) ?? { code: null, name: '—' }) : null,
      source: e.source,
      isNewPatient: e.isNewPatient,
      points: e.points,
      status: e.status,
      rejectReason: e.rejectReason,
      origin: e.origin,
    })),
    team,
  };
}

/**
 * Lo que el sistema completa solo al registrar un logro con paciente: la
 * clínica y si es NEW o EXISTING.
 *
 * NEW = el paciente no tuvo ninguna cita válida (sin contar canceladas ni
 * no-show) ANTES del mes del premio. Es la regla del Excel ("NEW/EXISTING
 * derived from patient.first_seen_date"), medida contra el mes y no contra el
 * día: una membresía vendida en su segunda visita del mes sigue siendo de un
 * paciente nuevo.
 *
 * Clínica = la de su cita más reciente hasta ese día; si no tiene, la primera
 * futura. Sin citas queda vacía, y no pasa nada: la clínica es un dato del
 * registro, no reparte plata.
 */
export async function datosDelPaciente(patientId: string, dia: string, mes: string) {
  const inicioMes = fechaDeMes(mes);
  const hasta = new Date(`${dia}T23:59:59Z`);
  const valida = { ...VIGENTES, patientId, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } };

  const [primera, ultima, proxima] = await Promise.all([
    db.appointment.findFirst({ where: valida, orderBy: { scheduledFor: 'asc' }, select: { scheduledFor: true } }),
    db.appointment.findFirst({
      where: { ...valida, scheduledFor: { lte: hasta } },
      orderBy: { scheduledFor: 'desc' },
      select: { clinicId: true, clinic: { select: { name: true } } },
    }),
    db.appointment.findFirst({
      where: { ...valida, scheduledFor: { gt: hasta } },
      orderBy: { scheduledFor: 'asc' },
      select: { clinicId: true, clinic: { select: { name: true } } },
    }),
  ]);

  const clinica = ultima ?? proxima;
  return {
    isNewPatient: !primera || primera.scheduledFor >= inicioMes,
    firstVisit: primera ? primera.scheduledFor.toISOString() : null,
    clinicId: clinica?.clinicId ?? null,
    clinicName: clinica?.clinic.name ?? null,
  };
}
