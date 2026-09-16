/**
 * POST /api/admin/cases/[id]/billing/pay
 *   Registra uno o varios pagos contra billing records del caso.
 *
 *   body: {
 *     payments: [{ billingId, amount, discount?, notes? }],  // una entrada por cita a pagar
 *     source: 'INSURANCE' | 'PATIENT' | 'LAWYER',
 *     method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE',
 *     paymentType: string | null,    // 'direct_insurance' | 'contractual_obligation' | etc.
 *     insuranceCarrierId: string | null,
 *     paidAt: string | null,         // ISO date
 *   }
 *
 *   `discount` es lo PERDONADO en ese mismo cobro (Reduction agreement y
 *   similares): baja el saldo pero no cuenta como cobrado, y se revierte al
 *   anular el pago. Ver `lib/saldo-del-cargo.ts`.
 *
 *   Actualiza amountPaid y balanceDue en cada AppointmentBilling.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { recalcularSaldoDelCargo, saldoAplicable } from '@/lib/saldo-del-cargo';

const Schema = z.object({
  payments: z.array(z.object({
    billingId: z.string(),
    amount:    z.number().min(0),
    discount:  z.number().min(0).default(0),
    notes:     z.string().nullable().default(null),
  }).refine(p => p.amount + p.discount > 0, {
    // Cobrar $0 y perdonar $0 no es un pago: antes lo impedía `positive()` en
    // `amount`, pero ahora perdonar sin cobrar un peso es un caso legítimo.
    message: 'amount + discount debe ser mayor que 0',
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
  const actor = await resolveActor(req.headers);
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
  let totalPerdonado = 0;

  for (const entry of parsed.payments) {
    // Verify billing belongs to this case (caseId may be null on migrated records — fall back to appointment.caseId)
    const billing = await db.appointmentBilling.findUnique({
      where: { id: entry.billingId },
      select: {
        id: true, caseId: true,
        appointment: { select: { caseId: true } },
      },
    });

    const effectiveCaseId = billing?.caseId ?? billing?.appointment?.caseId ?? null;
    if (!billing || effectiveCaseId !== caseId) {
      return NextResponse.json(
        { error: 'BILLING_NOT_FOUND', billingId: entry.billingId },
        { status: 404 },
      );
    }

    /**
     * El tope es lo que queda por aplicar, y lo cobrado se atiende PRIMERO.
     *
     * Si entre los dos se pasan del saldo, lo que se recorta es el descuento:
     * la plata que entró de verdad no se puede achicar —está en el cheque— y
     * perdonar de más es el error barato de corregir.
     */
    const aplicable = await saldoAplicable(entry.billingId);
    const monto = Math.min(entry.amount, aplicable);
    const perdonado = Math.min(entry.discount, Math.max(0, aplicable - monto));
    if (monto + perdonado <= 0) continue;

    // Create payment record
    const payment = await db.billingPayment.create({
      data: {
        billingId:         entry.billingId,
        source:            parsed.source,
        paymentType:       parsed.paymentType,
        amount:            monto,
        discount:          perdonado,
        method:            parsed.method,
        status:            'COMPLETED',
        insuranceCarrierId: parsed.source === 'INSURANCE' ? parsed.insuranceCarrierId : null,
        notes:             entry.notes,
        paidAt,
      },
    });
    createdPayments.push(payment.id);
    totalPerdonado += perdonado;

    // Los totales del cargo salen de sus pagos, no de una resta sobre el valor
    // anterior: es la única forma de que cobrar, perdonar y anular den lo mismo.
    await recalcularSaldoDelCargo(entry.billingId);
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
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
      // Lo perdonado va al audit aunque sea 0: es plata que la clínica deja de
      // recibir y tiene que poder rastrearse hasta quién la perdonó.
      totalDiscount: totalPerdonado,
    },
  });

  return NextResponse.json({ ok: true, paymentIds: createdPayments });
}
