/**
 * DELETE /api/admin/cases/[id]/billing/[billingId]/payments/[payId]
 *   Cancela un pago (status → CANCELLED) y revierte amountPaid / balanceDue.
 *
 *   Devuelve las DOS cosas: lo cobrado y lo perdonado. Es lo que hace que el
 *   descuento pueda colgar del pago — se anula el pago y el saldo vuelve
 *   entero, sin que nadie tenga que acordarse de deshacerlo aparte.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { recalcularSaldoDelCargo } from '@/lib/saldo-del-cargo';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; billingId: string; payId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, billingId, payId } = await ctx.params;

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
    data: { status: 'CANCELLED' },
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
    metadata: { caseCode: caseRecord?.caseCode, paymentId: payId, refundAmount, refundDiscount },
  });

  return NextResponse.json({ ok: true });
}
