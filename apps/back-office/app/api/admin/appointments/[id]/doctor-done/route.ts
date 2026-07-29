/**
 * El doctor terminó con el paciente (B.18 · nodo Resumen)
 *
 * POST   /api/admin/appointments/[id]/doctor-done   → sella doctorDoneAt
 * DELETE /api/admin/appointments/[id]/doctor-done   → lo borra (el doctor vuelve a la consulta)
 *
 * NO cambia el estado de la cita: el asistente la sigue viendo en su cola y la
 * pasa a COMPLETED cuando cobra (decisión de Erick 2026-07-29). Son dos actos
 * de dos personas distintas.
 *
 * Requiere nota FIRMADA — es el guardrail contra notas que quedan en borrador.
 *
 * NOTA: `doctorDoneAt` se lee y escribe con SQL directo. La columna ya existe
 * en la DB (db push aplicado) pero el cliente de Prisma no se pudo regenerar
 * (EPERM en Windows: otro dev server tenía tomado el motor). Cambiar a
 * `db.appointment.update` cuando se regenere.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(id);
  if (deny) return deny;

  const note = await db.visitNote.findUnique({
    where: { appointmentId: id },
    select: { status: true },
  });

  if (note?.status !== 'SIGNED') {
    return NextResponse.json({ error: 'NOTE_NOT_SIGNED' }, { status: 409 });
  }

  const rows = await db.$queryRaw<Array<{ doctorDoneAt: Date | null }>>`
    UPDATE appointments
       SET "doctorDoneAt" = COALESCE("doctorDoneAt", now()), "updatedAt" = now()
     WHERE id = ${id}
    RETURNING "doctorDoneAt"
  `;

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'DOCTOR_DONE_WITH_PATIENT',
    entityType: 'Appointment',
    entityId: id,
    metadata: { doctorName: actor.name },
  }).catch(() => undefined);

  return NextResponse.json({ doctorDoneAt: rows[0]?.doctorDoneAt ?? null });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(id);
  if (deny) return deny;

  await db.$executeRaw`
    UPDATE appointments SET "doctorDoneAt" = NULL, "updatedAt" = now() WHERE id = ${id}
  `;

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'DOCTOR_REOPEN_VISIT',
    entityType: 'Appointment',
    entityId: id,
    metadata: { doctorName: actor.name },
  }).catch(() => undefined);

  return NextResponse.json({ doctorDoneAt: null });
}
