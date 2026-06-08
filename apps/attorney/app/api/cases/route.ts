/**
 * GET /api/cases
 * B.22 — Lista de casos del bufete (Phase 1A: mock attorney = primer Lawyer del DB)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  // Phase 1A: primer Lawyer activo = attorney mock
  const attorney = await db.lawyer.findFirst({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, firmName: true, firstName: true, lastName: true, email: true },
  });
  if (!attorney) return NextResponse.json({ ok: false, error: 'NO_ATTORNEY' }, { status: 404 });

  const cases = await db.case.findMany({
    where: {
      lawFirmId: attorney.id,
      deletedAt: null,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
      appointments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          visitNote: { select: { id: true, status: true, signedAt: true } },
          provider:  { select: { firstName: true, lastName: true } },
          clinic:    { select: { name: true } },
        },
        orderBy: { scheduledFor: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calcular flags de lien readiness para cada caso
  const enriched = cases.map(c => {
    const appts       = c.appointments;
    const signedNotes = appts.filter(a => a.visitNote?.status === 'SIGNED');
    const lastAppt    = appts[0] ?? null;
    const nextAppt    = [...appts].reverse().find(a =>
      new Date(a.scheduledFor) >= new Date() && a.status !== 'COMPLETED',
    ) ?? null;

    // Lien ready = al menos 1 nota firmada y caso activo
    const lienReady   = signedNotes.length > 0 && c.status !== 'CLOSED';
    const patientSigned = false; // Phase 1A: mock
    const doctorSigned  = signedNotes.length > 0;

    return {
      id:           c.id,
      caseCode:     c.caseCode,
      status:       c.status,
      accidentDate: c.accidentDate,
      accidentType: c.accidentType,
      patient: {
        id:        c.patient.id,
        firstName: c.patient.firstName,
        lastName:  c.patient.lastName,
        dob:       c.patient.dateOfBirth,
      },
      visitCount:    appts.length,
      signedCount:   signedNotes.length,
      lastVisit:     lastAppt?.scheduledFor ?? null,
      nextVisit:     nextAppt  ? { date: nextAppt.scheduledFor, provider: nextAppt.provider, clinic: nextAppt.clinic } : null,
      lienReady,
      patientSigned,
      doctorSigned,
    };
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'ATTORNEY_VIEW_CASE_LIST',
    entityType:  'lawyer',
    entityId:    attorney.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCount: cases.length },
  });

  return NextResponse.json({
    ok: true,
    attorney: { id: attorney.id, firmName: attorney.firmName, firstName: attorney.firstName, lastName: attorney.lastName },
    cases: enriched,
  });
}
