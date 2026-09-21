-- 20260921b — El segundo precio: MVA vs medicina general
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Los mismos códigos se cobran a dos precios según el caso: uno para MVA
-- (accidente, con lien) y otro más bajo para medicina general. El 99214 son
-- $300 y $166. En v3 el catálogo tiene UN solo precio —el de MVA— así que una
-- visita de medicina general sale al doble y no hay forma de corregirla.
--
-- Darrell, 2026-09-21: "I can't finish those visits without it."
--
-- ── De dónde salen estos números ────────────────────────────────────────────
--
-- ⚠️ NO existe una lista de precios de medicina general escrita en ningún lado.
-- Se preguntó: no la hay. En el v2 tampoco existía — `services` tiene UNA sola
-- columna `cost` (la de MVA) y lo que había era un campo EDITABLE por cargo
-- (`appointment_service.cost`). El precio de general se tipeaba a mano, una vez
-- por visita, desde siempre.
--
-- Así que la única fuente es lo que la clínica efectivamente cobró. Estos
-- números salen de cruzar `appointment_service.cost` con `cases.type` (el v2 ya
-- distinguía 'MVA' y 'GM') sobre los cargos **desde 2025-01-01** — los viejos no
-- sirven, los precios cambiaron.
--
-- Solo se siembran los códigos donde el dato es contundente: precio dominante
-- usado 10+ veces de cada lado. Donde los dos lados cobran igual, NO se siembra
-- nada (`NULL` = un solo precio, que es el caso de la enorme mayoría).
--
--   código     MVA         general     evidencia (desde 2025)
--   ───────────────────────────────────────────────────────────────────────────
--   99214      $300        $166        1350/96% · 804/86%   ← el que se reportó
--   99204      $500        $322         436/99% · 130/90%
--   20553      $300        $185         250/99% ·  14/67%
--   20552      $300        $170         118/94% ·  30/52%   ⚠️ ver abajo
--   20610      $500        $176          25/83% ·  18/51%   ⚠️ ver abajo
--   NO SHOW    $100         $50         400/100% · 19/100%  (de 2026)
--   97110      $125         $36          47/100% ·   5/83%  ⚠️ ver abajo
--
-- ── Los tres con asterisco ──────────────────────────────────────────────────
--
-- · 20552: general se parte entre $170 (x30) y $120 (x17), y sigue partido en
--   2026. Se siembra la moda. No es exacto — pero hoy ese cargo sale $300, que
--   está mal el 94% de las veces. Cualquier precio de general le gana.
-- · 20610: el `currentFee` dice $500 y en MVA se cobra $400 (25 de 30 veces).
--   O sea que el precio de MVA TAMBIÉN está mal, pero corregirlo es una decisión
--   de tarifario y no se toca acá.
-- · 97110: general tiene solo 6 cargos. 5 dicen $36 contra $125 de MVA — es
--   consistente y la diferencia es 3,5x, así que se siembra; queda editable.
--
-- ── Lo que NO se sembró, a propósito ────────────────────────────────────────
--
-- · 20550: los $1500 de "MVA" son 4 cargos sueltos contra $90 del catálogo, y
--   general cobra $90 (x17). No hay dos precios: hay outliers.
-- · 99213: MVA casi no se usa (8 cargos, al MISMO precio que general). Lo que
--   hay no es un renglón sino un catálogo mal: dice $250 y se cobra $110 (2025)
--   → $155 (2026); el $250 aparece 9 veces de 266. Es un precio base
--   equivocado, no un segundo precio. Queda anotado para Erick.
-- · 99396 / 99385 / 99386 / 81003: mismo caso, solo se usan en general y el
--   `currentFee` no coincide con lo que se cobra. Tarifario, no renglón.
--
-- ── Por qué solo en `service_codes` ─────────────────────────────────────────
--
-- El renglón MVA/general es un concepto de TARIFARIO y aplica a los códigos que
-- se facturan. El catálogo de efectivo (`catalog_items`) son cosas que el
-- paciente compra —férulas, insumos— y ahí el precio no depende de si hubo un
-- accidente. Si algún día lo necesita, el campo se agrega; hoy sería una columna
-- muerta en 18 filas.
--
-- Idempotente: `IF NOT EXISTS` y cada UPDATE filtra por el valor que va a poner.
--
-- ⚠️ Se aplica con `node scripts/apply-sql.cjs prisma/sql/20260921b-precio-de-medicina-general.sql`.
--    `prisma db execute` no habla con el pooler.

ALTER TABLE "service_codes"
  ADD COLUMN IF NOT EXISTS "feeGeneral" DECIMAL(10,2);

COMMENT ON COLUMN "service_codes"."feeGeneral" IS
  'Precio para casos de medicina general (cases.caseType = GENERAL). NULL = un solo precio para todos, que es lo normal. currentFee sigue siendo el precio de MVA. Sembrado del historial real del v2 (appointment_service.cost x cases.type, desde 2025) porque no existe un tarifario de general escrito.';

UPDATE "service_codes" SET "feeGeneral" = 166 WHERE "code" = '99214'   AND "feeGeneral" IS DISTINCT FROM 166;
UPDATE "service_codes" SET "feeGeneral" = 322 WHERE "code" = '99204'   AND "feeGeneral" IS DISTINCT FROM 322;
UPDATE "service_codes" SET "feeGeneral" = 185 WHERE "code" = '20553'   AND "feeGeneral" IS DISTINCT FROM 185;
UPDATE "service_codes" SET "feeGeneral" = 170 WHERE "code" = '20552'   AND "feeGeneral" IS DISTINCT FROM 170;
UPDATE "service_codes" SET "feeGeneral" = 176 WHERE "code" = '20610'   AND "feeGeneral" IS DISTINCT FROM 176;
UPDATE "service_codes" SET "feeGeneral" =  50 WHERE "code" = 'NO SHOW' AND "feeGeneral" IS DISTINCT FROM 50;
UPDATE "service_codes" SET "feeGeneral" =  36 WHERE "code" = '97110'   AND "feeGeneral" IS DISTINCT FROM 36;

-- ── Para verificar ──────────────────────────────────────────────────────────
--
--   SELECT code, "shortDescription", "currentFee" AS mva, "feeGeneral" AS general
--     FROM service_codes WHERE "feeGeneral" IS NOT NULL ORDER BY code;
--
-- Esperado: 7 filas.
