/**
 * DELETE /api/admin/cases/[id]/billing/[billingId]/payments/[payId]
 *   Cancela un pago (status → CANCELLED) y revierte amountPaid / balanceDue.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; billingId: string; payId: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId, billingId, payId } = await ctx.params;

  const payment = await db.billingPayment.findUnique({
    where: { id: payId },
    select: { id: true, billingId: true, amount: true, status: true },
  });

  if (!payment || payment.billingId !== billingId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (payment.status === 'CANCELLED') {
    return NextResponse.json({ error: 'ALREADY_CANCELLED' }, { status: 409 });
  }

  const billing = await db.appointmentBilling.findUnique({
    where: { id: billingId },
    select: { id: true, caseId: true, amountPaid: true, balanceDue: true, totalCost: true, discount: true },
  });
  if (!billing || billing.caseId !== caseId) {
    return NextResponse.json({ error: 'BILLING_NOT_FOUND' }, { status: 404 });
  }

  const refundAmount = Number(payment.amount);
  const newAmountPaid = Math.max(0, Number(billing.amountPaid) - refundAmount);
  const newBalanceDue = Number(billing.totalCost) - Number(billing.discount) - newAmountPaid;

  await db.billingPayment.update({
    where: { id: payId },
    data: { status: 'CANCELLED' },
  });

  await db.appointmentBilling.update({
    where: { id: billingId },
    data: { amountPaid: newAmountPaid, balanceDue: Math.max(0, newBalanceDue) },
  });

  const caseRecord = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CANCEL_BILLING_PAYMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, paymentId: payId, refundAmount },
  });

  return NextResponse.json({ ok: true });
}
