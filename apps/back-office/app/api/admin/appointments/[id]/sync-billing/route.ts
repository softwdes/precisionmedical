/**
 * POST /api/admin/appointments/:id/sync-billing
 *
 * Creates one AppointmentBilling record per CPT service.
 * Uses raw SQL to bypass Prisma client type issues with new columns.
 *
 * IMPORTANTE: solo administra los cobros que nacen de `plannedServiceCodes`.
 * En `appointment_billing` también viven cobros de OTRAS fuentes, cada una con su
 * propio sincronizador:
 *   · férulas          → `braceId`       (lib/brace-billing.ts)
 *   · cargos efectivo  → `cashServiceId` (lib/cash-service-billing.ts)
 * Esas filas se excluyen explícitamente de la query. Sin ese filtro esta ruta las
 * borraba: las de férulas por tener `serviceCode` nulo (caían en el DELETE de
 * "agregados"), y las de efectivo por tener un código que no está en la lista de
 * CPT (caían en el DELETE de "códigos removidos"). Pasaba en cada guardado del
 * tab de servicios.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { randomUUID } from 'crypto';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    let bodyJson: { caseId?: string } = {};
    try { bodyJson = await req.json(); } catch { /* no body */ }

    const appt = await db.appointment.findUnique({
      where: { id },
      select: { id: true, caseId: true, plannedServiceCodes: true },
    });

    if (!appt) return NextResponse.json({ ok: false, reason: 'no_appt' });

    const caseId = appt.caseId ?? bodyJson.caseId ?? null;
    if (!caseId) return NextResponse.json({ ok: false, reason: 'no_case' });

    const codes = (appt.plannedServiceCodes ?? []) as { id?: string; code: string; description: string; fee: number }[];
    if (codes.length === 0) return NextResponse.json({ ok: false, reason: 'no_services' });

    // Get existing billing rows + sum of active payments via raw SQL
    type BillingRow = { id: string; serviceCode: string | null; amountPaid: bigint | number };
    const existing = await db.$queryRaw<BillingRow[]>`
      SELECT ab.id, ab."serviceCode", COALESCE(SUM(p.amount), 0) as "amountPaid"
      FROM appointment_billing ab
      LEFT JOIN billing_payments p ON p."billingId" = ab.id AND p.status != 'CANCELLED'
      WHERE ab."appointmentId" = ${id}
        AND ab."braceId" IS NULL
        AND ab."cashServiceId" IS NULL
      GROUP BY ab.id, ab."serviceCode"
    `;

    // Delete aggregate records (serviceCode IS NULL) with no payments
    for (const b of existing) {
      if (!b.serviceCode && Number(b.amountPaid) === 0) {
        await db.$executeRaw`DELETE FROM appointment_billing WHERE id = ${b.id}`;
      }
    }

    const perService = existing.filter(b => b.serviceCode);
    const existingByCode = new Map(perService.map(b => [b.serviceCode!, b]));

    for (const svc of codes) {
      const fee = svc.fee ?? 0;
      if (fee <= 0) continue;

      const prev = existingByCode.get(svc.code);
      if (prev) {
        const paid = Number(prev.amountPaid);
        const balance = Math.max(0, fee - paid);
        await db.$executeRaw`
          UPDATE appointment_billing
          SET "totalCost" = ${fee}, "balanceDue" = ${balance}, "serviceDescription" = ${svc.description}, "updatedAt" = NOW()
          WHERE id = ${prev.id}
        `;
        existingByCode.delete(svc.code);
      } else {
        const newId = randomUUID();
        await db.$executeRaw`
          INSERT INTO appointment_billing
            (id, "appointmentId", "caseId", "serviceCode", "serviceDescription", "totalCost", discount, "insuranceCovered", "amountPaid", "balanceDue", "createdAt", "updatedAt")
          VALUES
            (${newId}, ${id}, ${caseId}, ${svc.code}, ${svc.description}, ${fee}, 0, 0, 0, ${fee}, NOW(), NOW())
        `;
      }
    }

    // Delete billing for removed CPT codes (only if no payments)
    for (const stale of existingByCode.values()) {
      if (Number(stale.amountPaid) === 0) {
        await db.$executeRaw`DELETE FROM appointment_billing WHERE id = ${stale.id}`;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sync-billing] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
