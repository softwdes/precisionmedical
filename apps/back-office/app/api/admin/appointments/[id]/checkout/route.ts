/**
 * Checkout de la cita — el asistente cierra la visita (B.15)
 *
 * POST   /api/admin/appointments/[id]/checkout  → status COMPLETED
 * DELETE /api/admin/appointments/[id]/checkout  → vuelve a IN_PROGRESS (se cerró por error)
 *
 * Hasta ahora NADA en la app marcaba una cita como COMPLETED: 19 citas habían
 * hecho check-in y ninguna estaba cerrada. Este es el botón que faltaba.
 *
 * No bloquea (decisión de Erick 2026-07-29): el paciente se está yendo, cerrar
 * siempre es posible. La respuesta informa qué quedó pendiente para que la UI lo
 * muestre en ámbar; una nota en borrador le sigue apareciendo al doctor en
 * "Acción requerida".
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(id);
  if (deny) return deny;

  const appt = await db.appointment.findUnique({
    where: { id },
    select: {
      id: true, status: true, checkedInAt: true,
      visitNote: { select: { status: true, diagnoses: { select: { id: true } } } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return NextResponse.json({ error: 'APPOINTMENT_CLOSED' }, { status: 409 });
  }

  // Idempotente: si ya está cerrada, no se vuelve a escribir ni a auditar
  if (appt.status === 'COMPLETED') {
    return NextResponse.json({ ok: true, alreadyCompleted: true, status: 'COMPLETED' });
  }

  await db.appointment.update({
    where: { id },
    data: { status: 'COMPLETED' },
  });

  const pending = {
    noteUnsigned: appt.visitNote?.status !== 'SIGNED',
    noDiagnoses: (appt.visitNote?.diagnoses.length ?? 0) === 0,
  };

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'CHECKOUT_APPOINTMENT',
    entityType: 'Appointment',
    entityId: id,
    metadata: { by: actor.name, role: actor.role, from: appt.status, ...pending },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status: 'COMPLETED', pending });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(id);
  if (deny) return deny;

  const appt = await db.appointment.findUnique({
    where: { id },
    select: { status: true, checkedInAt: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (appt.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'NOT_COMPLETED' }, { status: 409 });
  }

  await db.appointment.update({
    where: { id },
    data: { status: appt.checkedInAt ? 'IN_PROGRESS' : 'CHECKED_IN' },
  });

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'REOPEN_APPOINTMENT',
    entityType: 'Appointment',
    entityId: id,
    metadata: { by: actor.name, role: actor.role },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status: appt.checkedInAt ? 'IN_PROGRESS' : 'CHECKED_IN' });
}
