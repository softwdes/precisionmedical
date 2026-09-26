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
    /**
     * Quién paga, cómo y de qué tipo — OPCIONALES y por entrada.
     *
     * Si no vienen, cae a los del envío, que es como funcionaba antes: todo
     * llamador existente sigue andando sin tocar una línea.
     *
     * Hacían falta porque un mismo cargo recibe pagos de distinta especie a
     * la vez —copago del paciente, cheque del seguro y ajuste contractual
     * sobre la MISMA visita— y con un solo tipo por envío eso eran tres
     * rondas: abrir la ventana, cargar, cerrar, y de nuevo (Darrell,
     * 25-sep-2026, regularizando una visita del 30-ene).
     *
     * El loop de abajo recalcula el saldo en CADA vuelta, así que varias
     * entradas contra el mismo `billingId` se aplican en orden y sin pisarse.
     */
    source:             z.enum(['INSURANCE', 'PATIENT', 'LAWYER']).optional(),
    method:             z.enum(['CHECK', 'CARD', 'CASH', 'TRANSFER', 'NONE']).optional(),
    paymentType:        z.string().nullable().optional(),
    insuranceCarrierId: z.string().nullable().optional(),
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
  /**
   * Lo REALMENTE aplicado, para el audit log.
   *
   * Desde que cada entrada puede traer su propio quién-paga y tipo, anotar
   * los del envío sería escribir un dato falso en el registro legal: un
   * envío con copago + cheque del seguro + ajuste quedaría asentado como si
   * los tres fueran del tipo que vino por defecto.
   */
  const aplicados: Array<{ source: string; paymentType: string | null }> = [];
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
    // Lo de la entrada manda; el del envío es el default.
    const source      = entry.source      ?? parsed.source;
    const method      = entry.method      ?? parsed.method;
    const paymentType = entry.paymentType !== undefined ? entry.paymentType : parsed.paymentType;
    const carrierId   = entry.insuranceCarrierId !== undefined
      ? entry.insuranceCarrierId
      : parsed.insuranceCarrierId;

    const payment = await db.billingPayment.create({
      data: {
        billingId:         entry.billingId,
        source,
        paymentType,
        amount:            monto,
        discount:          perdonado,
        method,
        status:            'COMPLETED',
        insuranceCarrierId: source === 'INSURANCE' ? carrierId : null,
        notes:             entry.notes,
        paidAt,
      },
    });
    createdPayments.push(payment.id);
    aplicados.push({ source, paymentType });
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
      // Los distintos, no el del envío: ver `aplicados`.
      sources: [...new Set(aplicados.map(a => a.source))],
      paymentTypes: [...new Set(aplicados.map(a => a.paymentType))],
      paymentIds: createdPayments,
      totalEntries: parsed.payments.length,
      // Lo perdonado va al audit aunque sea 0: es plata que la clínica deja de
      // recibir y tiene que poder rastrearse hasta quién la perdonó.
      totalDiscount: totalPerdonado,
    },
  });

  return NextResponse.json({ ok: true, paymentIds: createdPayments });
}
