import { db } from '@precision-medical/database';
import { DashboardClient } from './dashboard-client';

// B.29 — Dashboard de Recepción
// Vista panel agregada · KPIs del día · cola por status · alertas · citas · activity feed

export default async function DashboardPage() {
  // DEBUG — captura error real para diagnóstico en Vercel
  try {
    return await DashboardPageInner();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? (e.stack ?? '') : '';
    return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: '#f87171', background: '#0a0a0a', minHeight: '100vh' }}>
        <h2 style={{ color: '#fbbf24', marginBottom: 16 }}>🔴 Dashboard Error (DEBUG)</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>{msg}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#6b7280', marginTop: 16 }}>{stack}</pre>
      </div>
    );
  }
}

async function DashboardPageInner() {
  // Definir "hoy" en Utah local (UTC-6/-7 según DST).
  // Para simplicidad acá usamos UTC midnight — Phase 2 con timezone lib propia.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 60 * 60 * 1000);

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // ──────────────────────────────────────────────────────────────────
  // KPIs del día (Front Office)
  // ──────────────────────────────────────────────────────────────────
  const [
    casesCreatedToday,
    portalsSentToday,
    confirmsToday,
    schedulesToday,
  ] = await Promise.all([
    db.case.count({
      where: { createdAt: { gte: startOfToday, lte: endOfToday }, deletedAt: null },
    }),
    db.auditLog.count({
      where: { action: 'SEND_PORTAL_LINK', createdAt: { gte: startOfToday, lte: endOfToday } },
    }),
    db.auditLog.count({
      where: { action: 'CONFIRM_FIRST_APPOINTMENT', createdAt: { gte: startOfToday, lte: endOfToday } },
    }),
    db.auditLog.count({
      where: { action: 'SCHEDULE_FIRST_APPOINTMENT', createdAt: { gte: startOfToday, lte: endOfToday } },
    }),
  ]);

  // ──────────────────────────────────────────────────────────────────
  // Cola por status (cuántos casos activos en cada etapa)
  // ──────────────────────────────────────────────────────────────────
  const statusGroups = await db.case.groupBy({
    by: ['status'],
    where: {
      deletedAt: null,
      status: { in: ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED', 'ACTIVE'] },
    },
    _count: { _all: true },
  });
  const statusCounts = {
    NEW_REFERRAL:     statusGroups.find((g) => g.status === 'NEW_REFERRAL')?._count._all ?? 0,
    INTAKE_PENDING:   statusGroups.find((g) => g.status === 'INTAKE_PENDING')?._count._all ?? 0,
    INTAKE_COMPLETED: statusGroups.find((g) => g.status === 'INTAKE_COMPLETED')?._count._all ?? 0,
    CONFIRMED:        statusGroups.find((g) => g.status === 'CONFIRMED')?._count._all ?? 0,
    ACTIVE:           statusGroups.find((g) => g.status === 'ACTIVE')?._count._all ?? 0,
  };

  // ──────────────────────────────────────────────────────────────────
  // Alertas — atención requerida
  // ──────────────────────────────────────────────────────────────────
  const [
    newReferralsAged,   // NEW_REFERRAL > 1h sin portal enviado
    intakeStalled,      // INTAKE_PENDING > 24h (paciente no respondió)
    confirmedNoSched,   // CONFIRMED > 48h sin agendar
  ] = await Promise.all([
    db.case.findMany({
      where: {
        status: 'NEW_REFERRAL',
        deletedAt: null,
        createdAt: { lte: oneHourAgo },
      },
      take: 10,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, caseCode: true, createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    db.case.findMany({
      where: {
        status: 'INTAKE_PENDING',
        deletedAt: null,
        intakeFormSentAt: { lte: oneDayAgo },
      },
      take: 10,
      orderBy: { intakeFormSentAt: 'asc' },
      select: {
        id: true, caseCode: true, intakeFormSentAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    db.case.findMany({
      where: {
        status: 'CONFIRMED',
        deletedAt: null,
        firstAppointmentConfirmedAt: { lte: twoDaysAgo },
      },
      take: 10,
      orderBy: { firstAppointmentConfirmedAt: 'asc' },
      select: {
        id: true, caseCode: true, firstAppointmentConfirmedAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  // ──────────────────────────────────────────────────────────────────
  // Próximas citas (hoy + mañana)
  // ──────────────────────────────────────────────────────────────────
  const upcomingAppointments = await db.appointment.findMany({
    where: {
      scheduledFor: { gte: startOfToday, lte: endOfTomorrow },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'PENDING'] },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 30,
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      type: true,
      status: true,
      patient: { select: { firstName: true, lastName: true } },
      clinic: { select: { name: true } },
      provider: { select: { firstName: true, lastName: true, specialty: true } },
      case: { select: { id: true, caseCode: true } },
    },
  });

  // ──────────────────────────────────────────────────────────────────
  // Activity feed — últimos eventos del Front Office
  // ──────────────────────────────────────────────────────────────────
  const recentActivity = await db.auditLog.findMany({
    where: {
      entityType: 'cases',
      action: {
        in: [
          'CREATE_CASE_FROM_CALL',
          'SEND_PORTAL_LINK',
          'MARK_INTAKE_COMPLETE_DEV',
          'CONFIRM_FIRST_APPOINTMENT',
          'SCHEDULE_FIRST_APPOINTMENT',
          'INSERT_CASE_NOTE',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorUserId: true,
      createdAt: true,
      entityId: true,
      metadata: true,
    },
  });

  // Resolver caseCode para cada activity event (1 query)
  const caseIds = Array.from(new Set(recentActivity.map((e) => e.entityId).filter(Boolean) as string[]));
  const cases = caseIds.length === 0 ? [] : await db.case.findMany({
    where: { id: { in: caseIds } },
    select: {
      id: true,
      caseCode: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  const caseMap = new Map(cases.map((c) => [c.id, c]));

  return (
    <DashboardClient
      kpis={{
        casesCreatedToday,
        portalsSentToday,
        confirmsToday,
        schedulesToday,
      }}
      statusCounts={statusCounts}
      alerts={{
        newReferralsAged: newReferralsAged.map((c) => ({
          id: c.id, caseCode: c.caseCode, createdAt: c.createdAt,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
        intakeStalled: intakeStalled.map((c) => ({
          id: c.id, caseCode: c.caseCode, sentAt: c.intakeFormSentAt!,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
        confirmedNoSched: confirmedNoSched.map((c) => ({
          id: c.id, caseCode: c.caseCode, confirmedAt: c.firstAppointmentConfirmedAt!,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
      }}
      upcomingAppointments={upcomingAppointments.map((a) => ({
        id: a.id,
        scheduledFor: a.scheduledFor,
        durationMinutes: a.durationMinutes,
        type: a.type,
        status: a.status,
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        clinicName: a.clinic.name,
        providerName: a.provider ? `Dr. ${a.provider.firstName} ${a.provider.lastName}` : null,
        providerSpecialty: a.provider?.specialty ?? null,
        caseId: a.case?.id ?? null,
        caseCode: a.case?.caseCode ?? null,
      }))}
      recentActivity={recentActivity.map((e) => {
        const caseInfo = e.entityId ? caseMap.get(e.entityId) : null;
        return {
          id: e.id,
          action: e.action,
          actorType: e.actorType,
          actorUserId: e.actorUserId,
          createdAt: e.createdAt,
          caseId: e.entityId,
          caseCode: caseInfo?.caseCode ?? null,
          patientName: caseInfo ? `${caseInfo.patient.firstName} ${caseInfo.patient.lastName}` : null,
          metadata: e.metadata as Record<string, unknown> | null,
        };
      })}
      todayBoundary={{ start: startOfToday, end: endOfToday, tomorrowStart: startOfTomorrow }}
    />
  );
}
