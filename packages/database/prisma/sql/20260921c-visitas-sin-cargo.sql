-- 20260921c — Los códigos que valen $0 a propósito
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- A veces hay visita y no se cobra: el paciente vino solo a que le sacaran
-- sangre. Para eso la clínica usa el código 88888 —se llama, literalmente,
-- "No Charge Visit"— desde antes del v3.
--
-- En v3 no se puede cargar. El picker ve `currentFee = 0`, muestra "Sin precio ·
-- Poner monto", y el botón de confirmar exige un monto MAYOR a cero: con el 0
-- puesto queda apagado. Darrell, 2026-09-21: "If you can activate the add button
-- when it is at 0 it would be correct."
--
-- ── Por qué una marca y no simplemente aceptar el cero ──────────────────────
--
-- Porque hoy `currentFee = 0` significa DOS cosas que no tienen nada que ver, y
-- el sistema no las distingue:
--
--   a) vale cero a propósito        → 88888 · 99024
--   b) nadie cargó el precio        → 62323 · 64483 · 64491 50 · 64493 ·
--                                     64636 · 77002 · 93219
--
-- Los del grupo (b) no son gratis. En el v2 se cobraron así:
--
--   62323     epidural lumbar con imagen        $2.500  (x6)
--   64483     epidural lumbar/sacra             $2.500
--   64491 50  bloqueo facetario 2.º nivel       $2.000
--   77002     guía fluoroscópica                  $341
--
-- Si el botón aceptara el cero para cualquiera, alguien registra una epidural de
-- $2.500 y `sync-billing` —que saltea todo cargo con `fee <= 0`— no factura
-- nada, sin avisar. Ese es justamente el agujero que el guard vino a tapar.
--
-- Y no hay antecedente de lo contrario: en el v2, **ningún código con precio se
-- cobró jamás en $0**. Cero veces en 8.634 cargos.
--
-- ── Los dos que se marcan ───────────────────────────────────────────────────
--
-- · 88888 "No Charge Visit" — 84 usos en el v2, los 84 en $0. Nunca otra cosa.
-- · 99024 "Postoperative Follow-up Visit" — CPT estándar de la visita de control
--   posoperatoria: va incluida en el período global de la cirugía y por
--   definición no se factura aparte. Sin uso en el v2 (el v3 lo trajo del
--   catálogo AMA), pero su precio correcto ES cero, no un dato faltante.
--
-- ── Qué pasa cuando se agrega uno ───────────────────────────────────────────
--
-- El cargo se guarda en `appointments.plannedServiceCodes` (el PATCH acepta
-- `fee: 0`), la pestaña Servicios lo MUESTRA —lee de ahí, no de la tabla de
-- facturación— y `sync-billing` no le crea fila de cobro. O sea: queda el
-- registro de que hubo visita y la deuda no se mueve. Que es exactamente lo que
-- se quiere.
--
-- ── Lo que esta marca NO hace ───────────────────────────────────────────────
--
-- No habilita poner $0 a mano en un código con precio. Perdonar un cargo ya
-- tiene su camino —el descuento del modal de pago— y ese deja rastro de quién y
-- cuándo. Un cargo en cero no deja ninguno.
--
-- Idempotente: `IF NOT EXISTS` y el UPDATE filtra por el valor.
--
-- ⚠️ Se aplica con `node scripts/apply-sql.cjs prisma/sql/20260921c-visitas-sin-cargo.sql`.

ALTER TABLE "service_codes"
  ADD COLUMN IF NOT EXISTS "isNoCharge" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "service_codes"."isNoCharge" IS
  'El precio 0 es intencional, no un dato faltante: la visita queda registrada y no genera cobro. Distingue 88888/99024 de los codigos a los que simplemente nadie les cargo el precio (62323, 64483... que valen miles). El picker los agrega de un clic; el resto de los codigos en cero sigue pidiendo el monto.';

UPDATE "service_codes"
   SET "isNoCharge" = true
 WHERE "code" IN ('88888', '99024')
   AND "isNoCharge" = false;

-- ── Para verificar ──────────────────────────────────────────────────────────
--
--   SELECT code, "shortDescription", "currentFee", "isNoCharge"
--     FROM service_codes WHERE "isNoCharge";
--
-- Esperado: 2 filas, las dos con currentFee = 0.
--
-- Y que NO se haya colado ninguno de los que sí valen plata:
--
--   SELECT code, "shortDescription" FROM service_codes
--    WHERE "isActive" AND "currentFee" <= 0 AND NOT "isNoCharge" ORDER BY code;
--
-- Esperado: los 8 restantes (7 sin precio + LABS, que es isInternalOnly).
