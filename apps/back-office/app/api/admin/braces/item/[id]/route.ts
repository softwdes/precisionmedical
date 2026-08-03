import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { syncBraceBilling } from '@/lib/brace-billing';

/**
 * PATCH /api/admin/braces/item/[id]
 *
 * Cambia el estado de una férula ya entregada — es el caso real más frecuente:
 * se entregó la talla equivocada y el paciente vuelve a cambiarla.
 *
 *  - RETURNED: la devolvió
 *  - VOIDED:   se cargó por error
 *
 * Al salir de DISPENSED, el cobro se retira (si nadie pagó). Si ya se había
 * pagado, la fila de cobro queda y el reembolso se maneja anulando el pago:
 * no se borra plata cobrada por detrás.
 *
 * También permite corregir cantidad y lado sin volver a cargar la férula.
 */

const PatchSchema = z.object({
  status: z.enum(['DISPENSED', 'RETURNED', 'VOIDED']).optional(),
  side: z.enum(['NA', 'LEFT', 'RIGHT']).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  voidReason: z.string().max(300).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const brace = await db.appointmentBrace.findUnique({
    where: { id },
    select: { id: true, appointmentId: true, name: true, status: true },
  });
  if (!brace) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // El guard se hace sobre la CITA: así el permiso es el mismo que para cargarla
  const { deny, actor } = await checkAppointmentAccess(brace.appointmentId);
  if (deny) return deny;

  let body;
  try { body = PatchSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const leavingDispensed = body.status && body.status !== 'DISPENSED';

  const updated = await db.appointmentBrace.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.side ? { side: body.side } : {}),
      ...(body.quantity ? { quantity: body.quantity } : {}),
      ...(body.voidReason !== undefined ? { voidReason: body.voidReason } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(leavingDispensed ? { voidedAt: new Date() } : {}),
    },
    select: { id: true, status: true, side: true, quantity: true },
  });

  await syncBraceBilling(brace.appointmentId);

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: leavingDispensed ? 'VOID_BRACE' : 'UPDATE_BRACE',
    entityType: 'appointment_braces',
    entityId: id,
    metadata: {
      appointmentId: brace.appointmentId,
      name: brace.name,
      from: brace.status,
      to: updated.status,
      reason: body.voidReason ?? null,
      by: actor.name,
    },
  }).catch(() => undefined);

  return NextResponse.json({ brace: updated });
}
