import { db } from '@precision-medical/database';

/**
 * Puente servicios e inyectables en efectivo → facturación.
 *
 * Gemelo de `lib/brace-billing.ts`, y por el mismo motivo: cada cargo genera SU
 * PROPIA fila de `appointment_billing`, identificada por `cashServiceId` y no por
 * el código del ítem. Dos aplicaciones del mismo inyectable en la misma visita
 * son dos cobros distintos — agrupar por código los colapsaría en uno. (Es el bug
 * latente que sigue vivo en `sync-billing` con los CPT repetidos; acá no.)
 *
 * Así los cargos en efectivo caen en la MISMA tabla que los servicios de seguro y
 * las férulas, y el checkout los cobra todo junto sin tocar los totales ni el
 * modal de pago.
 *
 * Regla de negocio: esto es lo que paga el paciente de su bolsillo, así que el
 * cobro nace con `insuranceCovered = 0` y el saldo completo a su cargo. Si el
 * ítem tenía código de seguro, se guarda en `AppointmentService.cptCode` como
 * evidencia — pero no se factura a nadie: el paciente ya lo pagó.
 */
export async function syncCashServiceBilling(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { caseId: true },
  });
  if (!appt?.caseId) return; // sin caso no hay dónde facturar

  const [charges, existing] = await Promise.all([
    db.appointmentService.findMany({
      where: { appointmentId, status: 'CHARGED' },
      select: { id: true, code: true, name: true, quantity: true, unitPrice: true, unitLabel: true },
    }),
    db.appointmentBilling.findMany({
      where: { appointmentId, cashServiceId: { not: null } },
      select: {
        id: true,
        cashServiceId: true,
        payments: { where: { status: { not: 'CANCELLED' } }, select: { amount: true } },
      },
    }),
  ]);

  const byCharge = new Map(existing.map((b) => [b.cashServiceId!, b]));

  for (const charge of charges) {
    const total = Number(charge.unitPrice) * charge.quantity;
    if (total <= 0) continue;

    const qtyLabel = charge.quantity > 1 ? ` ×${charge.quantity}` : '';
    const unit = charge.unitLabel ? ` · ${charge.unitLabel}` : '';
    const description = `${charge.name}${unit}${qtyLabel}`;

    const prev = byCharge.get(charge.id);
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
      byCharge.delete(charge.id);
    } else {
      await db.appointmentBilling.create({
        data: {
          appointmentId,
          caseId: appt.caseId,
          cashServiceId: charge.id,
          // El código del ítem del catálogo, para que el checkout y el historial
          // muestren de qué se trata. No es un CPT facturable.
          serviceCode: charge.code,
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

  // Cargos anulados: se borra su cobro solo si nadie pagó nada. Si ya se pagó, la
  // fila queda y el reembolso se maneja como anulación de pago — no se borra
  // plata cobrada por detrás.
  for (const stale of byCharge.values()) {
    const paid = stale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (paid === 0) {
      await db.appointmentBilling.delete({ where: { id: stale.id } });
    }
  }
}
