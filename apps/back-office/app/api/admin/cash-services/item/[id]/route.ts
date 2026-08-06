import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { syncCashServiceBilling } from '@/lib/cash-service-billing';

/**
 * PATCH /api/admin/cash-services/item/[id]
 *
 * Corrige o anula un cargo en efectivo. Gemelo de
 * `/api/admin/braces/item/[id]`.
 *
 * `VOIDED` en vez de borrar la fila: el cargo pasó, alguien lo hizo y quedó en la
 * auditoría. Al salir de CHARGED el cobro se retira, pero solo si nadie pagó — si
 * ya se cobró, la fila de billing queda y el reembolso se maneja anulando el
 * pago. No se borra plata cobrada por detrás.
 */

const PatchSchema = z.object({
  status: z.enum(['CHARGED', 'VOIDED']).optional(),
  quantity: z.number().int().min(1).max(50).optional(),
  voidReason: z.string().max(300).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const charge = await db.appointmentService.findUnique({
    where: { id },
    select: { id: true, appointmentId: true, name: true, status: true },
  });
  if (!charge) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // El guard va sobre la CITA: el permiso es el mismo que para cargarlo.
  const { deny, actor } = await checkAppointmentAccess(charge.appointmentId);
  if (deny) return deny;

  let body;
  try { body = PatchSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const voiding = body.status === 'VOIDED';

  const updated = await db.appointmentService.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.quantity ? { quantity: body.quantity } : {}),
      ...(body.voidReason !== undefined ? { voidReason: body.voidReason } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(voiding ? { voidedAt: new Date() } : {}),
    },
    select: { id: true, status: true, quantity: true },
  });

  await syncCashServiceBilling(charge.appointmentId);

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: voiding ? 'VOID_CASH_SERVICE' : 'UPDATE_CASH_SERVICE',
    entityType: 'appointment_services',
    entityId: id,
    metadata: {
      appointmentId: charge.appointmentId,
      name: charge.name,
      from: charge.status,
      to: updated.status,
      reason: body.voidReason ?? null,
      by: actor.name,
    },
  }).catch(() => undefined);

  return NextResponse.json({ charge: updated });
}
