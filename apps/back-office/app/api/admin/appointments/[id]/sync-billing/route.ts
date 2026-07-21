/**
 * POST /api/admin/appointments/:id/sync-billing
 *
 * Creates or updates the AppointmentBilling record from plannedServiceCodes.
 * Called when the Payments tab loads and no billing record exists yet.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const appt = await db.appointment.findUnique({
    where: { id },
    select: { id: true, caseId: true, plannedServiceCodes: true },
  });
  if (!appt || !appt.caseId) return NextResponse.json({ ok: false });

  const codes = (appt.plannedServiceCodes ?? []) as { fee: number }[];
  const totalCost = codes.reduce((s, c) => s + (c.fee ?? 0), 0);
  if (totalCost <= 0) return NextResponse.json({ ok: false, reason: 'no_services' });

  const existing = await db.appointmentBilling.findFirst({
    where: { appointmentId: id },
    select: { id: true, amountPaid: true },
  });

  if (existing) {
    const balanceDue = Math.max(0, totalCost - Number(existing.amountPaid));
    await db.appointmentBilling.update({
      where: { id: existing.id },
      data: { totalCost, balanceDue },
    });
  } else {
    await db.appointmentBilling.create({
      data: {
        appointmentId: id,
        caseId: appt.caseId,
        totalCost,
        discount: 0,
        insuranceCovered: 0,
        amountPaid: 0,
        balanceDue: totalCost,
      },
    });
  }

  return NextResponse.json({ ok: true, totalCost });
}
