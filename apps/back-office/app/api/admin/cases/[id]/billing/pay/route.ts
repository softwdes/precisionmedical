/**
 * POST /api/admin/cases/[id]/billing/pay
 *   Registra uno o varios pagos contra billing records del caso.
 *
 *   body: {
 *     payments: [{ billingId, amount, notes? }],  // una entrada por cita a pagar
 *     source: 'INSURANCE' | 'PATIENT' | 'LAWYER',
 *     method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE',
 *     paymentType: string | null,    // 'direct_insurance' | 'contractual_obligation' | etc.
 *     insuranceCarrierId: string | null,
 *     paidAt: string | null,         // ISO date
 *   }
 *
 *   Actualiza amountPaid y balanceDue en cada AppointmentBilling.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const Schema = z.object({
  payments: z.array(z.object({
    billingId: z.string(),
    amount:    z.number().positive(),
    notes:     z.string().nullable().default(null),
  })).min(1),
  source:            z.enum(['INSURANCE', 'PATIENT', 'LAWYER']),
  method:            z.enum(['CHECK', 'CARD', 'CASH', 'TRANSFER', 'NONE']).default('NONE'),
  paymentType:       z.string().nullable().default(null),
  insuranceCarrierId: z.string().nullable().default(null),
  paidAt:            z.string().nullable().default(null),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = Schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const paidAt = parsed.paidAt ? new Date(parsed.paidAt) : new Date();
  const createdPayments: string[] = [];

  for (const entry of parsed.payments) {
    // Verify billing belongs to this case
    const billing = await db.appointmentBilling.findUnique({
      where: { id: entry.billingId },
      select: { id: true, caseId: true, balanceDue: true, amountPaid: true },
    });

    if (!billing || billing.caseId !== caseId) {
      return NextResponse.json(
        { error: 'BILLING_NOT_FOUND', billingId: entry.billingId },
        { status: 404 },
      );
    }

    const maxPayable = Number(billing.balanceDue);
    const actualAmount = Math.min(entry.amount, maxPayable);
    if (actualAmount <= 0) continue;

    // Create payment record
    const payment = await db.billingPayment.create({
      data: {
        billingId:         entry.billingId,
        source:            parsed.source,
        paymentType:       parsed.paymentType,
        amount:            actualAmount,
        method:            parsed.method,
        status:            'COMPLETED',
        insuranceCarrierId: parsed.source === 'INSURANCE' ? parsed.insuranceCarrierId : null,
        notes:             entry.notes,
        paidAt,
      },
    });
    createdPayments.push(payment.id);

    // Update billing totals
    const newAmountPaid = Number(billing.amountPaid) + actualAmount;
    const newBalanceDue = Math.max(0, Number(billing.balanceDue) - actualAmount);

    await db.appointmentBilling.update({
      where: { id: entry.billingId },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
      },
    });
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'REGISTER_BILLING_PAYMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord.caseCode,
      source: parsed.source,
      paymentType: parsed.paymentType,
      paymentIds: createdPayments,
      totalEntries: parsed.payments.length,
    },
  });

  return NextResponse.json({ ok: true, paymentIds: createdPayments });
}
