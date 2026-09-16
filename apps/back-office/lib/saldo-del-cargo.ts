import { db } from '@precision-medical/database';

/**
 * El saldo de un cargo, en un solo lugar.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * La fórmula estaba escrita tres veces y las tres decían cosas distintas:
 * registrar un pago hacía `balanceDue − monto` (ignorando el descuento del
 * cargo), anularlo hacía `totalCost − descuento − pagado`, y la sincronización
 * de CPT hacía `fee − pagado`. Mientras el descuento fue siempre 0 nadie lo
 * notó; con el descuento del PAGO los tres caminos se separan de verdad — y el
 * de sincronización, que corre cada vez que se toca un código de la nota,
 * resucitaría la plata que se acababa de perdonar.
 *
 * ── La fórmula ──────────────────────────────────────────────────────────────
 *
 *   amountPaid = Σ(pagos vigentes.amount)
 *   balanceDue = totalCost − discount(del cargo) − amountPaid − Σ(pagos vigentes.discount)
 *
 * Lo perdonado NO entra en `amountPaid`: es plata que la clínica resigna, no
 * que recibió. Si sumara, "Total cobrado" mentiría en la pantalla y en los
 * reportes.
 *
 * `discount` del CARGO sigue restando: son 16 filas que vinieron del v2 y
 * sacarlas del cálculo cambiaría 16 saldos sin que nadie lo pidiera.
 *
 * Vigentes = todo lo que no está `CANCELLED`. Un pago anulado deja de contar en
 * los dos términos a la vez, que es lo que hace que anular devuelva el saldo
 * entero y no solo la parte cobrada.
 */

type Db = typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Recalcula `amountPaid` y `balanceDue` del cargo desde sus pagos y los guarda.
 *
 * Se llama DESPUÉS de crear, anular o editar un pago. Recalcula desde la suma
 * en vez de sumar/restar sobre el valor anterior a propósito: un incremental
 * arrastra para siempre cualquier fila que haya quedado torcida, y acá ya hubo
 * una carrera de dos POST simultáneos (ver `sync-billing`).
 */
export async function recalcularSaldoDelCargo(
  billingId: string,
  tx: Db = db,
): Promise<{ amountPaid: number; balanceDue: number } | null> {
  const cargo = await tx.appointmentBilling.findUnique({
    where: { id: billingId },
    select: {
      totalCost: true,
      discount: true,
      payments: {
        where: { status: { not: 'CANCELLED' } },
        select: { amount: true, discount: true },
      },
    },
  });
  if (!cargo) return null;

  const cobrado = cargo.payments.reduce((s, p) => s + Number(p.amount), 0);
  const perdonado = cargo.payments.reduce((s, p) => s + Number(p.discount), 0);

  const amountPaid = redondear(cobrado);
  // Nunca negativo: perdonar de más es un error de carga, no un crédito a favor
  // del paciente, y un saldo en rojo se propagaría a los totales del caso.
  const balanceDue = redondear(
    Math.max(0, Number(cargo.totalCost) - Number(cargo.discount) - cobrado - perdonado),
  );

  await tx.appointmentBilling.update({
    where: { id: billingId },
    data: { amountPaid, balanceDue },
  });

  return { amountPaid, balanceDue };
}

/**
 * Lo que todavía se puede aplicar contra un cargo — cobrando, perdonando o las
 * dos cosas.
 *
 * Es el tope que valida el servidor: el diálogo ya lo limita al escribir, pero
 * el que manda es este, porque dos pestañas abiertas sobre el mismo cargo ven
 * cada una el saldo de antes.
 */
export async function saldoAplicable(billingId: string, tx: Db = db): Promise<number> {
  const cargo = await tx.appointmentBilling.findUnique({
    where: { id: billingId },
    select: {
      totalCost: true,
      discount: true,
      payments: {
        where: { status: { not: 'CANCELLED' } },
        select: { amount: true, discount: true },
      },
    },
  });
  if (!cargo) return 0;

  const aplicado = cargo.payments.reduce(
    (s, p) => s + Number(p.amount) + Number(p.discount),
    0,
  );
  return Math.max(0, redondear(Number(cargo.totalCost) - Number(cargo.discount) - aplicado));
}

/**
 * A centavos. Sin esto, repartir $70 entre tres líneas deja saldos de
 * 0.000000001 y la fila se queda "pendiente" para siempre mostrando $0.00.
 */
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
