/**
 * POST /api/admin/appointments/[id]/confirm
 * Marca una cita como CONFIRMED.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const appt = await db.appointment.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (appt.status === 'COMPLETED' || appt.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: 'CONFIRMED' },
    select: { id: true, status: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CONFIRM_APPOINTMENT',
    entityType: 'appointment',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { previousStatus: appt.status },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
