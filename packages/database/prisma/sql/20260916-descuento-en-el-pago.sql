-- El DESCUENTO vive en el pago, no en el cargo.
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Finanzas necesita poder cerrar una deuda por MENOS de lo que dice. Pasa todo
-- el tiempo con los abogados, y la prueba está en nuestra propia lista de tipos
-- de pago: "Reduction agreement (Red AG)" existe exactamente para eso. Hasta
-- hoy se podía elegir ese tipo y no había dónde anotar cuánto se perdonó, así
-- que el saldo quedaba colgado para siempre aunque el caso estuviera cerrado.
--
-- ── Por qué en el PAGO y no en el cargo ─────────────────────────────────────
--
-- `appointment_billing.discount` ya existe y entra en la fórmula del saldo,
-- pero **ninguna ruta lo escribía**: el único que lo tocaba es la sincronización
-- de cobros, que lo inserta en 0. La primera versión de esto (16-sep) agregaba
-- un endpoint para escribir esa columna. Erick lo frenó ese mismo día y tenía
-- razón, por tres motivos:
--
--   1. **No es reversible.** Anular el pago que originó el descuento no lo
--      deshace: queda escrito en el cargo para siempre y nada lo vuelve atrás.
--   2. **No tiene dueño.** El número no dice quién lo descontó, cuándo ni sobre
--      qué cobro — y es plata que la clínica deja de recibir.
--   3. **El dato lo desmiente.** Solo 16 de 6.462 cargos tienen `discount`; el
--      v2 nunca usó esa columna para esto.
--
-- Colgado del pago, el descuento nace y muere con él: se anula el pago y el
-- saldo vuelve solo, por la misma vía que ya revierte `amountPaid`.
--
-- ── La fórmula ──────────────────────────────────────────────────────────────
--
--   balanceDue = totalCost − discount(del cargo) − Σ(pagos.amount) − Σ(pagos.discount)
--
-- El término viejo del cargo se conserva: hay 16 filas que lo usan y borrarlas
-- cambiaría 16 saldos sin que nadie lo haya pedido.
--
-- ⚠️ Lo corre Erick con `scripts/apply-sql.cjs` — `prisma db execute` no habla
-- con el pooler (ver la nota del proyecto).

ALTER TABLE billing_payments
  ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN billing_payments.discount IS
  'Monto perdonado EN ESTE pago. Se resta del saldo del cargo junto con amount, y se revierte al anular el pago. No es un descuento del cargo: eso es appointment_billing.discount, que quedó solo para las 16 filas que vinieron del v2.';

-- Nada que rellenar: los 546 pagos existentes no perdonaron nada, y el DEFAULT 0
-- ya los deja correctos. Por eso no hay backfill — y por eso esta migración es
-- segura de correr con la app arriba.
