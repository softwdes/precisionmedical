/**
 * POST /api/admin/appointments/[id]/confirm
 * Marca una cita como CONFIRMED.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor = await resolveActor(req.headers);

  const appt = await db.appointment.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (appt.status === 'COMPLETED' || appt.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }
  // Máquina de estados: confirmar NUNCA degrada a un paciente que ya llegó.
  // (Bug real 2026-07-28: un confirm tardío regresó IN_PROGRESS → CONFIRMED y
  // el paciente "desapareció" de la sala en la vista del doctor.)
  if (appt.status === 'CHECKED_IN' || appt.status === 'IN_PROGRESS') {
    return NextResponse.json({ ok: true, appointment: { id: appt.id, status: appt.status }, alreadyArrived: true });
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: 'CONFIRMED' },
    select: { id: true, status: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'CONFIRM_APPOINTMENT',
    entityType: 'appointment',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { previousStatus: appt.status },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
