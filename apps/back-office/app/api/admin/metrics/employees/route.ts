/**
 * GET /api/admin/metrics/employees?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Fase 3 de métricas por empleado — el reporte de productividad del admin.
 * Solo ADMIN / SUPER_ADMIN: es supervisión de personal.
 *
 * Tres fuentes, una identidad (`users.id` cuid de Phoenix):
 *   · AuditLog     — todo lo que la Fase 1 atribuyó (pacientes, casos, citas,
 *                    check-ins, triajes, labs, servicios, férulas, pagos,
 *                    checkouts, cierres del doctor…), agrupado por actor+acción.
 *   · CallLog      — llamadas hechas (OUTBOUND) y contestadas (INBOUND con
 *                    agente). OJO: `agentUserId` es el UUID de Supabase Auth,
 *                    no el cuid — se puentea por email igual que call-logs.
 *   · user_activity — minutos de uso activo (Fase 2).
 *
 * `from`/`to` son DÍAS de America/Denver, inclusivos. El servidor los convierte
 * a límites UTC exactos por fecha (DST-aware), así "Hoy" es el hoy de la
 * clínica y no el de UTC.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Medianoche de un día de Denver, en UTC (DST-aware por fecha, no por hoy). */
function denverDayStart(day: string): Date {
  const probe = new Date(`${day}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(offsetPart);
  const hours = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(hours)).padStart(2, '0');
  return new Date(`${day}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
}

function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Acción del audit log → columna del reporte. Lo que no está acá igual viaja
 * en `byAction` para el desglose por empleado.
 */
const ACTION_TO_METRIC: Record<string, keyof EmployeeCounters> = {
  CREATE_PATIENT:             'patientsCreated',
  CREATE_CASE_FROM_CALL:      'casesCreated',
  CREATE_APPOINTMENT:         'appointmentsCreated',
  SCHEDULE_FIRST_APPOINTMENT: 'appointmentsCreated',
  CHECK_IN:                   'checkIns',
  TRIAGE_VITALS_SAVED:        'triages',
  CREATE_LAB_ORDER:           'labs',
  ADD_LAB_ORDER:              'labs',
  UPLOAD_LAB_RESULT:          'labs',
  CHARGE_CASH_SERVICE:        'cashServices',
  DISPENSE_BRACE:             'braces',
  REGISTER_BILLING_PAYMENT:   'payments',
  CHECKOUT_APPOINTMENT:       'checkouts',
  DOCTOR_DONE_WITH_PATIENT:   'doctorDone',
  SIGN_VISIT_NOTE:            'notesSigned',
};

interface EmployeeCounters {
  patientsCreated: number;
  casesCreated: number;
  appointmentsCreated: number;
  checkIns: number;
  triages: number;
  labs: number;
  cashServices: number;
  braces: number;
  payments: number;
  checkouts: number;
  doctorDone: number;
  notesSigned: number;
}

const emptyCounters = (): EmployeeCounters => ({
  patientsCreated: 0, casesCreated: 0, appointmentsCreated: 0, checkIns: 0,
  triages: 0, labs: 0, cashServices: 0, braces: 0, payments: 0, checkouts: 0,
  doctorDone: 0, notesSigned: 0,
});

export interface EmployeeMetricsRow extends EmployeeCounters {
  userId: string;
  name: string;
  role: string;
  activeMinutes: number;
  callsMade: number;
  callsAnswered: number;
  callsDurationSeconds: number;
  /** Desglose completo acción → conteo, para el detalle del empleado. */
  byAction: Record<string, number>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const me = await getDbUserByEmail(user.email);
  if (me?.role !== 'ADMIN' && me?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const from = denverDayStart(query.from);
  const toExclusive = denverDayStart(nextDay(query.to));
  if (from >= toExclusive) {
    return NextResponse.json({ error: 'INVALID_RANGE' }, { status: 400 });
  }

  const [users, auditGroups, callGroups, activityGroups] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null, role: { notIn: ['LAWYER', 'AUDITOR_AI'] } },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
    }),
    db.auditLog.groupBy({
      by: ['actorUserId', 'action'],
      where: {
        actorUserId: { not: null },
        actorType: 'HUMAN_USER',
        createdAt: { gte: from, lt: toExclusive },
      },
      _count: { _all: true },
    }),
    db.callLog.groupBy({
      by: ['agentUserId', 'direction'],
      where: {
        agentUserId: { not: null },
        createdAt: { gte: from, lt: toExclusive },
      },
      _count: { _all: true },
      _sum: { durationSeconds: true },
    }),
    db.userActivityBucket.groupBy({
      by: ['userId'],
      where: { bucketStart: { gte: from, lt: toExclusive } },
      _sum: { activeMinutes: true },
    }),
  ]);

  const rowByUserId = new Map<string, EmployeeMetricsRow>();
  for (const u of users) {
    rowByUserId.set(u.id, {
      userId: u.id,
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      role: u.role,
      activeMinutes: 0,
      callsMade: 0,
      callsAnswered: 0,
      callsDurationSeconds: 0,
      byAction: {},
      ...emptyCounters(),
    });
  }

  // ─── AuditLog → columnas + desglose ─────────────────────────────────────────
  for (const g of auditGroups) {
    const row = g.actorUserId ? rowByUserId.get(g.actorUserId) : undefined;
    if (!row) continue; // actor borrado o fuera del roster
    const n = g._count._all;
    row.byAction[g.action] = (row.byAction[g.action] ?? 0) + n;
    const metric = ACTION_TO_METRIC[g.action];
    if (metric) row[metric] += n;
  }

  // ─── CallLog → puente UUID de Auth → email → users.id ──────────────────────
  const agentIds = [...new Set(callGroups.map((g) => g.agentUserId).filter(Boolean))] as string[];
  if (agentIds.length > 0) {
    const admin = createAdminClient();
    const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    const phoenixIdByAgent = new Map<string, string>();
    await Promise.all(agentIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        const email = data?.user?.email?.toLowerCase();
        const phoenixId = email ? userIdByEmail.get(email) : undefined;
        if (phoenixId) phoenixIdByAgent.set(id, phoenixId);
      } catch { /* agente sin cuenta vinculada: sus llamadas no se atribuyen */ }
    }));

    for (const g of callGroups) {
      const phoenixId = g.agentUserId ? phoenixIdByAgent.get(g.agentUserId) : undefined;
      const row = phoenixId ? rowByUserId.get(phoenixId) : undefined;
      if (!row) continue;
      if (g.direction === 'OUTBOUND') row.callsMade += g._count._all;
      else row.callsAnswered += g._count._all;
      row.callsDurationSeconds += g._sum.durationSeconds ?? 0;
    }
  }

  // ─── Tiempo activo ──────────────────────────────────────────────────────────
  for (const g of activityGroups) {
    const row = rowByUserId.get(g.userId);
    if (row) row.activeMinutes = g._sum.activeMinutes ?? 0;
  }

  // Con actividad primero; el resto (todo en cero) al final por nombre.
  const totalOf = (r: EmployeeMetricsRow): number =>
    r.activeMinutes + r.callsMade + r.callsAnswered +
    Object.values(r.byAction).reduce((a, b) => a + b, 0);

  const employees = [...rowByUserId.values()].sort((a, b) => {
    const ta = totalOf(a); const tb = totalOf(b);
    if (ta !== tb) return tb - ta;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    from: query.from,
    to: query.to,
    employees,
  });
}
