/**
 * GET /api/admin/cases/[id]/billing
 *   Lista los registros de facturación del caso (AppointmentBilling + pagos).
 *   Ordenados por fecha de cita descendente (más reciente primero).
 *   Incluye KPIs agregados: totalCost, totalPaid, totalBalance.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const billings = await db.appointmentBilling.findMany({
    where: { caseId },
    include: {
      appointment: {
        select: { id: true, scheduledFor: true, status: true },
      },
      payments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { paidAt: 'desc' },
        include: {
          insuranceCarrier: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Sort by appointment date desc (most recent first)
  billings.sort((a, b) => {
    const da = a.appointment?.scheduledFor?.getTime() ?? 0;
    const db2 = b.appointment?.scheduledFor?.getTime() ?? 0;
    return db2 - da;
  });

  // Serialize Decimals to numbers for JSON transport
  const serialized = billings.map(b => ({
    id: b.id,
    appointmentId: b.appointmentId,
    appointmentDate: b.appointment?.scheduledFor ?? null,
    appointmentStatus: b.appointment?.status ?? null,
    totalCost: Number(b.totalCost),
    discount: Number(b.discount),
    insuranceCovered: Number(b.insuranceCovered),
    amountPaid: Number(b.amountPaid),
    balanceDue: Number(b.balanceDue),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    payments: b.payments.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      source: p.source,
      paymentType: p.paymentType,
      method: p.method,
      status: p.status,
      insuranceCarrier: p.insuranceCarrier,
      notes: p.notes,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
  }));

  const totalCost    = serialized.reduce((s, b) => s + b.totalCost, 0);
  const totalPaid    = serialized.reduce((s, b) => s + b.amountPaid, 0);
  const totalBalance = serialized.reduce((s, b) => s + b.balanceDue, 0);

  return NextResponse.json({
    billings: serialized,
    kpis: { totalCost, totalPaid, totalBalance },
  });
}
