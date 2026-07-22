/**
 * POST /api/admin/appointments/:id/sync-billing
 *
 * Creates one AppointmentBilling record per CPT service.
 * Called when the Servicios tab saves services. Existing records for
 * this appointment are deleted and recreated to stay in sync.
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

  const codes = (appt.plannedServiceCodes ?? []) as { id?: string; code: string; description: string; fee: number }[];
  if (codes.length === 0) return NextResponse.json({ ok: false, reason: 'no_services' });

  // Get existing billing records for this appointment (with their payments)
  const existing = await db.appointmentBilling.findMany({
    where: { appointmentId: id },
    include: { payments: { where: { status: { not: 'CANCELLED' } } } },
  });

  // Build a map: serviceCode → existing billing record
  const existingByCode = new Map(
    existing.map(b => [(b as Record<string, unknown>).serviceCode as string ?? '', b])
  );

  for (const svc of codes) {
    const fee = svc.fee ?? 0;
    if (fee <= 0) continue;

    const prev = existingByCode.get(svc.code);
    if (prev) {
      // Update cost but preserve payments
      const paid = prev.payments.reduce((s, p) => s + Number(p.amount), 0);
      await db.appointmentBilling.update({
        where: { id: prev.id },
        data: {
          totalCost: fee,
          balanceDue: Math.max(0, fee - paid),
          serviceDescription: svc.description,
        },
      });
      existingByCode.delete(svc.code);
    } else {
      await db.appointmentBilling.create({
        data: {
          appointmentId: id,
          caseId: appt.caseId,
          serviceCode: svc.code,
          serviceDescription: svc.description,
          totalCost: fee,
          discount: 0,
          insuranceCovered: 0,
          amountPaid: 0,
          balanceDue: fee,
        },
      });
    }
  }

  // Delete billing records for CPT codes that were removed (only if no payments)
  for (const stale of existingByCode.values()) {
    if (stale.payments.length === 0) {
      await db.appointmentBilling.delete({ where: { id: stale.id } });
    }
  }

  return NextResponse.json({ ok: true });
}
