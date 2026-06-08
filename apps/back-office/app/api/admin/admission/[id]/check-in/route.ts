/**
 * POST /api/admin/admission/[id]/check-in
 *
 * B.14 — Marcar paciente como llegado (CHECKED_IN).
 * Escribe audit log con actor.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor  = actorFromHeaders(req.headers);

  const appt = await db.appointment.findUnique({
    where:  { id },
    select: { id: true, status: true, patient: { select: { firstName: true, lastName: true } } },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (appt.status === 'CHECKED_IN' || appt.status === 'IN_PROGRESS' || appt.status === 'COMPLETED') {
    return NextResponse.json({ ok: true, status: appt.status, alreadyDone: true });
  }

  const now = new Date();
  await db.appointment.update({
    where: { id },
    data:  {
      status:      'CHECKED_IN',
      checkedInAt: now,
    } as Parameters<typeof db.appointment.update>[0]['data'],
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'CHECK_IN',
    entityType:  'appointment',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      checkedInAt: now.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, status: 'CHECKED_IN', checkedInAt: now.toISOString() });
}
