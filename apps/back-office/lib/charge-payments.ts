import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * Un cargo YA PAGADO no se borra.
 *
 * Regla de Erick (2026-08-13): mientras nadie pagó, un cargo se quita libremente
 * —se cargó de más, el paciente no se hizo el estudio—; una vez cobrado, sacarlo
 * es plata que se evapora sin dejar rastro contable. Ahí la vía es el REEMBOLSO o
 * el AJUSTE: primero se anula el pago (queda en el AuditLog como
 * CANCEL_BILLING_PAYMENT) y recién entonces el cargo vuelve a poder quitarse.
 *
 * Los sincronizadores de facturación ya protegían SU fila: al quitar un cargo
 * pagado no borraban el cobro. Pero el cargo de origen sí se anulaba, y quedaba
 * la peor de las dos fotos — la férula desaparecida del tab de Férulas y su plata
 * viva en el de Pagar, sin nada que explicara de dónde salía ese monto. El
 * bloqueo va acá, en la API, y no en el botón: la regla tiene que valer venga de
 * donde venga el pedido.
 */

/** Referencia al cargo de origen: una por fuente de `appointment_billing`. */
type RefCargo =
  | { labOrderId: string }
  | { cashServiceId: string }
  | { braceId: string };

/** Lo cobrado por ese cargo, sin contar los pagos anulados. */
export async function montoYaPagado(ref: RefCargo): Promise<number> {
  const filas = await db.appointmentBilling.findMany({
    where: ref,
    select: {
      payments: {
        where: { status: { not: 'CANCELLED' } },
        select: { amount: true },
      },
    },
  });
  return filas
    .flatMap((f) => f.payments)
    .reduce((suma, p) => suma + Number(p.amount), 0);
}

/**
 * Lo cobrado por los CPT de una cita, por código.
 *
 * Los CPT no tienen fila propia de origen —viven en el JSON
 * `plannedServiceCodes` de la cita— así que su identidad en facturación es el
 * par (cita, código). Son del circuito del seguro, pero pueden tener plata del
 * paciente encima: un copago es exactamente eso.
 */
export async function pagadoPorCodigoCpt(appointmentId: string): Promise<Map<string, number>> {
  const filas = await db.appointmentBilling.findMany({
    where: {
      appointmentId,
      braceId: null,
      cashServiceId: null,
      labOrderId: null,
      serviceCode: { not: null },
    },
    select: {
      serviceCode: true,
      payments: {
        where: { status: { not: 'CANCELLED' } },
        select: { amount: true },
      },
    },
  });
  const out = new Map<string, number>();
  for (const f of filas) {
    const pagado = f.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (pagado > 0) out.set(f.serviceCode!, (out.get(f.serviceCode!) ?? 0) + pagado);
  }
  return out;
}

/**
 * La negativa, con el monto adentro: el mostrador necesita saber CUÁNTO se
 * pagó para decidir si anula el pago o deja el cargo como está. 409 y no 403 —
 * es un conflicto con el estado del cargo, no un problema de permisos, y es el
 * mismo código que ya usa `HAS_RESULT` en las órdenes de laboratorio.
 */
export function respuestaYaPagado(paid: number): NextResponse {
  return NextResponse.json({ error: 'ALREADY_PAID', paid }, { status: 409 });
}
