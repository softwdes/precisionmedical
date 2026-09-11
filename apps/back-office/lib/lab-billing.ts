import { db } from '@precision-medical/database';

/**
 * Puente laboratorios → facturación.
 *
 * La clínica COBRA el estudio al paciente (regla de Erick 2026-08-08): labs,
 * férulas y servicios cash son el mismo circuito — se pagan en el momento, al
 * salir. Los CPT son el otro: solo se anotan y el encargado se los cobra al
 * seguro o al abogado meses después.
 *
 * Cada estudio pedido genera SU PROPIA fila de `appointment_billing`,
 * identificada por `labOrderId` y no por el código: es el mismo patrón de
 * `brace-billing.ts`, y evita que dos estudios distintos se colapsen.
 * Por eso quitar o anular un estudio retira su cobro y el total baja solo.
 *
 * El precio sale de `catalog_items` (kind=LAB) por código — el mismo catálogo
 * que muestra el buscador de la orden. **Estudio sin precio cargado no genera
 * cobro**: es preferible que no aparezca a cobrar $0 en silencio (hoy imagen,
 * cardiología y 84 labs no tienen precio; se cargan desde Price catalog).
 */
export async function syncLabBilling(appointmentId: string): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { caseId: true },
  });
  if (!appt?.caseId) return; // sin caso no hay dónde facturar

  const [orders, existing] = await Promise.all([
    db.labOrder.findMany({
      // Anulados fuera: el estudio no se le hizo al paciente.
      where: { appointmentId, status: { not: 'VOIDED' } },
      select: { id: true, studyName: true, studyCode: true, billingType: true },
    }),
    db.appointmentBilling.findMany({
      where: { appointmentId, labOrderId: { not: null } },
      select: {
        id: true,
        labOrderId: true,
        payments: { where: { status: { not: 'CANCELLED' } }, select: { amount: true } },
      },
    }),
  ]);

  const byOrder = new Map(existing.map((b) => [b.labOrderId!, b]));

  // Precios en UNA query: los códigos del estudio son los de `catalog_items`.
  const codes = orders.map((o) => o.studyCode).filter((c): c is string => !!c);
  const priced = codes.length
    ? await db.catalogItem.findMany({
        where: { kind: 'LAB', code: { in: codes } },
        select: { code: true, publicPrice: true },
      })
    : [];
  const priceByCode = new Map(priced.map((p) => [p.code, p.publicPrice !== null ? Number(p.publicPrice) : null]));

  for (const order of orders) {
    const price = order.studyCode ? priceByCode.get(order.studyCode) ?? null : null;
    const prev = byOrder.get(order.id);

    /*
     * QUIÉN PAGA EL ESTUDIO — regla de Erick (2026-09-10):
     *
     *   CLIENT  → LabCorp le factura a la CLÍNICA, y la clínica se lo cobra al
     *             paciente (compra al costo, revende al precio público).
     *   el resto → LabCorp le factura al SEGURO, así que **la clínica NO le
     *             cobra al paciente**. Cobrarle igual sería cobrar dos veces por
     *             el mismo estudio, una a cada lado.
     *
     * `null` cuenta como CLIENT: es lo que tienen las órdenes viejas, creadas
     * cuando el tipo estaba fijo en CLIENT y no se elegía. Tratarlas como
     * "seguro" les borraría un cobro legítimo ya emitido.
     *
     * No se hace `continue`: si el estudio pasó de CLIENT a seguro, su cobro
     * tiene que RETIRARSE, y eso pasa abajo con los "stale" — que ya respetan la
     * regla de no borrar plata cobrada.
     */
    const loPagaElPaciente = order.billingType === null || order.billingType === 'CLIENT';

    // Sin precio no se cobra. Si tenía cobro y el precio se borró del catálogo,
    // cae abajo con los "stale" y se retira si nadie pagó.
    if (!loPagaElPaciente || price === null || price <= 0) continue;

    if (prev) {
      const paid = prev.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      await db.appointmentBilling.update({
        where: { id: prev.id },
        data: {
          totalCost: price,
          balanceDue: Math.max(0, price - paid),
          serviceDescription: order.studyName,
        },
      });
      byOrder.delete(order.id);
    } else {
      await db.appointmentBilling.create({
        data: {
          appointmentId,
          caseId: appt.caseId,
          labOrderId: order.id,
          // El código va para mostrarlo; NO convierte esto en un cargo a
          // seguro: `payer` se decide por labOrderId, igual que las férulas.
          serviceCode: order.studyCode,
          serviceDescription: order.studyName,
          totalCost: price,
          discount: 0,
          insuranceCovered: 0,
          amountPaid: 0,
          balanceDue: price,
        },
      });
    }
  }

  // Estudios quitados o anulados: se retira su cobro solo si nadie pagó nada.
  // Si ya se pagó, la fila queda y el reembolso se maneja anulando el pago —
  // no se borra plata cobrada por detrás (misma regla que férulas).
  for (const stale of byOrder.values()) {
    const paid = stale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (paid === 0) {
      await db.appointmentBilling.delete({ where: { id: stale.id } });
    }
  }
}
