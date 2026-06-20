/**
 * B.11 — Check-in · POST
 *
 * POST /api/checkin/[appointmentId]
 *
 * Recepción confirma que el paciente llegó físicamente.
 * Transición: SCHEDULED | CONFIRMED → CHECKED_IN
 * Registra checkedInAt = now()
 * Idempotente: si ya está CHECKED_IN, devuelve ok.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id:     true,
      status: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      case:   { select: { id: true, caseCode: true } },
    },
  });

  if (!appt) {
    return NextResponse.json({ error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });
  }

  // Idempotente
  if (appt.status === 'CHECKED_IN') {
    return NextResponse.json({ ok: true, alreadyCheckedIn: true });
  }

  // Solo se puede hacer check-in desde SCHEDULED o CONFIRMED
  if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
    return NextResponse.json(
      { error: 'INVALID_STATUS', current: appt.status },
      { status: 409 },
    );
  }

  const actor = actorFromHeaders(req.headers);
  const body = await req.json().catch(() => ({})) as { staffNote?: string };

  await db.appointment.update({
    where: { id: appointmentId },
    data: {
      status:      'CHECKED_IN',
      checkedInAt: new Date(),
    },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'PATIENT_CHECKED_IN',
    entityType:  'Appointment',
    entityId:    appointmentId,
    metadata: {
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      caseCode:    appt.case?.caseCode,
      staffNote:   body.staffNote ?? null,
    },
  });

  return NextResponse.json({ ok: true, checkedInAt: new Date().toISOString() });
}

// PATCH para revertir check-in (recepción error) — solo a CONFIRMED
export async function PATCH(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (appt.status !== 'CHECKED_IN') {
    return NextResponse.json({ error: 'NOT_CHECKED_IN' }, { status: 409 });
  }

  await db.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', checkedInAt: null },
  });

  return NextResponse.json({ ok: true, reverted: true });
}
