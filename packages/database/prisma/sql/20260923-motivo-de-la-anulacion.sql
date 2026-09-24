-- 20260923 — Por qué se revirtió un pago
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Revertir un pago ya funcionaba: el pago pasa a `CANCELLED` —no se borra— y el
-- saldo recupera lo cobrado Y lo descontado en un solo paso. Lo que faltaba es
-- el POR QUÉ.
--
-- Darrell está aprendiendo a cobrar en v3 y se equivocó de pago. Erick,
-- 2026-09-23: "es nuevo el proceso y se puede equivocar (...) darle revert y que
-- ponga un comentario el porqué, y listo, ya puede corregir y hacer el pago
-- donde corresponde".
--
-- Sin motivo, dentro de seis meses un pago revertido es indistinguible de un
-- error de sistema. Y son tres columnas, no una: el texto no sirve de nada si no
-- se sabe QUIÉN lo escribió y CUÁNDO.
--
-- ── Por qué no se reusa `notes` ─────────────────────────────────────────────
--
-- `billing_payments.notes` es la nota DEL PAGO — la escribe quien cobra, en el
-- momento de cobrar, y explica el cobro. El motivo de la anulación explica lo
-- contrario. Pisar una con la otra perdería la primera justo en el caso donde
-- más se la quiere leer: el pago que hubo que deshacer.
--
-- ── Por qué columnas y no solo el audit log ─────────────────────────────────
--
-- El audit log ya registra `CANCEL_BILLING_PAYMENT` y el motivo también va ahí
-- (es el registro legal). Pero nadie navega el audit log: si alguien pregunta
-- "¿por qué se revirtió este cobro de $166?", la respuesta tiene que estar
-- colgada del pago, donde se la busca.
--
-- Es el mismo par que ya usa `appointment_services` para sus cargos anulados
-- (`voidReason` / `voidedAt`), así que no se inventa un patrón nuevo.
--
-- `voidedByName` denormalizado, como `coverageVerifiedByName`: el nombre se lee
-- sin un JOIN y sobrevive aunque la ficha del usuario cambie después.
--
-- Idempotente: `IF NOT EXISTS` en las tres.
--
-- ⚠️ Se aplica con:
--    node scripts/apply-sql.cjs prisma/sql/20260923-motivo-de-la-anulacion.sql

ALTER TABLE "billing_payments"
  ADD COLUMN IF NOT EXISTS "voidReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "voidedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedByName" TEXT;

COMMENT ON COLUMN "billing_payments"."voidReason" IS
  'Por que se revirtio este pago. Lo escribe quien lo revierte y es obligatorio en el dialogo. NO confundir con notes, que es la nota del COBRO y la escribe quien cobra.';

COMMENT ON COLUMN "billing_payments"."voidedAt" IS
  'Cuando se revirtio. Distinto de updatedAt, que se mueve por cualquier cambio.';

-- ── Para verificar ──────────────────────────────────────────────────────────
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='billing_payments'
--      AND column_name IN ('voidReason','voidedAt','voidedByName');
--
-- Esperado: 3 filas.
--
-- Los pagos ya anulados quedan con los tres en NULL — se revirtieron antes de
-- que existiera el campo y no hay de dónde inventarles un motivo. Para saber
-- cuántos son:
--
--   SELECT count(*) FROM billing_payments WHERE status = 'CANCELLED';
