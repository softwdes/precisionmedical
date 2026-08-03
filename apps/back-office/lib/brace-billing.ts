import { db } from '@precision-medical/database';

/**
 * Puente férulas → facturación.
 *
 * Cada férula entregada genera SU PROPIA fila de `appointment_billing`,
 * identificada por `braceId` y no por el código del item. Esto es deliberado:
 * una rodillera izquierda y una derecha son el mismo código y dos cobros
 * distintos — agrupar por código los colapsaría en uno. (Es justamente el bug
 * latente que hoy tiene `sync-billing` con los CPT repetidos; acá no se repite.)
 *
 * Así las férulas caen en la misma tabla que los servicios y el checkout las
 * cobra todo junto, sin tocar los totales ni el modal de pago.
 *
 * Regla de negocio: las férulas se pagan COMPLETAS, sin lien ni seguro
 * (`CatalogItem.alwaysFullPayment`). Por eso el cobro nace con
 * `insuranceCovered = 0` y el saldo completo a cargo del paciente.
 */
export async function syncBraceBilling(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { caseId: true },
  });
  if (!appt?.caseId) return; // sin caso no hay dónde facturar

  const [braces, existing] = await Promise.all([
    db.appointmentBrace.findMany({
      where: { appointmentId, status: 'DISPENSED' },
      select: { id: true, name: true, sizeLabel: true, side: true, quantity: true, unitPrice: true },
    }),
    db.appointmentBilling.findMany({
      where: { appointmentId, braceId: { not: null } },
      select: {
        id: true,
        braceId: true,
        payments: { where: { status: { not: 'CANCELLED' } }, select: { amount: true } },
      },
    }),
  ]);

  const byBrace = new Map(existing.map((b) => [b.braceId!, b]));

  for (const brace of braces) {
    const total = Number(brace.unitPrice) * brace.quantity;
    if (total <= 0) continue;

    const sideLabel = brace.side === 'LEFT' ? ' (Izq.)' : brace.side === 'RIGHT' ? ' (Der.)' : '';
    const qtyLabel = brace.quantity > 1 ? ` ×${brace.quantity}` : '';
    const description = `${brace.name}${brace.sizeLabel ? ` · ${brace.sizeLabel}` : ''}${sideLabel}${qtyLabel}`;

    const prev = byBrace.get(brace.id);
    if (prev) {
      const paid = prev.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      await db.appointmentBilling.update({
        where: { id: prev.id },
        data: {
          totalCost: total,
          balanceDue: Math.max(0, total - paid),
          serviceDescription: description,
        },
      });
      byBrace.delete(brace.id);
    } else {
      await db.appointmentBilling.create({
        data: {
          appointmentId,
          caseId: appt.caseId,
          braceId: brace.id,
          serviceCode: null, // el código del item vive en la férula, no acá
          serviceDescription: description,
          totalCost: total,
          discount: 0,
          insuranceCovered: 0,
          amountPaid: 0,
          balanceDue: total,
        },
      });
    }
  }

  // Férulas devueltas o anuladas: se borra su cobro solo si nadie pagó nada.
  // Si ya se pagó, la fila queda y el reembolso se maneja como anulación de
  // pago — no se borra plata cobrada por detrás.
  for (const stale of byBrace.values()) {
    const paid = stale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (paid === 0) {
      await db.appointmentBilling.delete({ where: { id: stale.id } });
    }
  }
}
