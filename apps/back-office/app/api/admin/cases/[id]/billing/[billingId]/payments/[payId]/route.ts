/**
 * DELETE /api/admin/cases/[id]/billing/[billingId]/payments/[payId]
 *   Cancela un pago (status → CANCELLED) y revierte amountPaid / balanceDue.
 *
 *   Devuelve las DOS cosas: lo cobrado y lo perdonado. Es lo que hace que el
 *   descuento pueda colgar del pago — se anula el pago y el saldo vuelve
 *   entero, sin que nadie tenga que acordarse de deshacerlo aparte.
 *
 *   Pide un MOTIVO en el cuerpo y lo exige. Un pago revertido sin explicación
 *   es, meses después, indistinguible de un error del sistema — y desde que
 *   Darrell está aprendiendo a cobrar en v3 revertir dejó de ser excepcional
 *   (Erick, 2026-09-23). El motivo se guarda en el pago Y va al audit log.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { recalcularSaldoDelCargo } from '@/lib/saldo-del-cargo';

/** El motivo es obligatorio: sin él, dentro de seis meses no se sabe qué pasó. */
const BodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; billingId: string; payId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, billingId, payId } = await ctx.params;

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch {
    return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 });
  }

  const payment = await db.billingPayment.findUnique({
    where: { id: payId },
    select: { id: true, billingId: true, amount: true, discount: true, status: true },
  });

  if (!payment || payment.billingId !== billingId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (payment.status === 'CANCELLED') {
    return NextResponse.json({ error: 'ALREADY_CANCELLED' }, { status: 409 });
  }

  const billing = await db.appointmentBilling.findUnique({
    where: { id: billingId },
    select: { id: true, caseId: true, appointment: { select: { caseId: true } } },
  });
  const effectiveCaseId = billing?.caseId ?? billing?.appointment?.caseId ?? null;
  if (!billing || effectiveCaseId !== caseId) {
    return NextResponse.json({ error: 'BILLING_NOT_FOUND' }, { status: 404 });
  }

  const refundAmount = Number(payment.amount);
  const refundDiscount = Number(payment.discount);

  await db.billingPayment.update({
    where: { id: payId },
    data: {
      status: 'CANCELLED',
      voidReason: body.reason,
      voidedAt: new Date(),
      voidedByName: actor.actorName,
    },
  });

  // El recálculo ya no ve este pago (filtra los CANCELLED), así que devuelve al
  // saldo tanto lo cobrado como lo perdonado en un solo paso.
  await recalcularSaldoDelCargo(billingId);

  const caseRecord = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'CANCEL_BILLING_PAYMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord?.caseCode, paymentId: payId, refundAmount, refundDiscount,
      reason: body.reason, by: actor.actorName,
    },
  });

  return NextResponse.json({ ok: true });
}
