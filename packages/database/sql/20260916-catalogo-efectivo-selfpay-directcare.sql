-- ============================================================
-- Cuatro opciones nuevas en la sección No insurance / Cash
-- Pedido de Devin vía Erick, 2026-09-16. Correr en el editor SQL de Supabase.
-- ============================================================
--
-- QUÉ AGREGA
--
--   Self Pay 1st Visit .................... $125
--   Self Pay Follow-Up Visit .............. $100
--   Direct Care Visit Copay ...............  $10
--   Apollo Primary Direct Care Visit Copay   $10
--
-- ── Por qué NO son códigos CPT y no van en `service_codes` ──────────────────
--
-- Se pidieron como "CPTs" 99998 y 99999, y eso no podía ser por tres razones:
--
--   1. La sección de efectivo NO se arma con `service_codes`. Ese catálogo
--      alimenta la lista de SEGURO. Lo de efectivo sale de `catalog_items`
--      (`kind IN ('INJECTION','SERVICE')`, activo, ordenable y con precio > 0).
--      Ver `app/api/admin/billable-items/route.ts`. Un código puesto en la
--      tabla equivocada no habría aparecido nunca en la pantalla que los pidió.
--   2. El 99999 YA ESTÁ OCUPADO en `service_codes` por basura de una prueba
--      end-to-end ("E2E Vestibular Therapy Initial Eval", 8-sep, nunca usada).
--   3. Ni 99998 ni 99999 son CPT reales. Si alguno sale en un reclamo, lo
--      rechazan. Devin confirmó usar el formato interno.
--
-- `cptCode` queda en NULL a propósito: esto lo paga el paciente de su bolsillo
-- y no viaja a ninguna aseguradora.
--
-- ── Sobre Apollo ───────────────────────────────────────────────────────────
--
-- `Apollo Plan` ya existe como aseguradora (shortCode `AP`), así que el sistema
-- YA distingue las visitas de Apollo por el plan del caso. Este ítem no existe
-- para identificarlas: existe para COBRAR los $10 en el mostrador cuando el
-- paciente viene por Apollo (Erick, 2026-09-16).
--
-- ── Lo que NO hace falta tocar ─────────────────────────────────────────────
--
-- `PM-DIRECT` ("Pago directo del paciente (self-pay)", $150) en `service_codes`
-- ya está `isActive = false` y nunca se cobró (0 usos). No compite con el nuevo
-- self-pay de $125 y no hay que desactivarlo: ya lo está.
--
-- `id`, `vendor`, `isActive`, `isOrderable`, `priceStatus` y `sortOrder` tienen
-- DEFAULT en la base — verificado en information_schema, no asumido.
--
-- ⚠️ `updatedAt` hay que pasarlo A MANO. Es `@updatedAt` de Prisma, que lo
-- rellena el CLIENTE, no la base: la columna es NOT NULL y no tiene default, así
-- que un INSERT por SQL que lo omita muere con "null value in column updatedAt".
-- Es el mismo caso que `@default(cuid())`, que tampoco existe en la base.
-- Las únicas obligatorias sin default son: kind, code, name y updatedAt.

BEGIN;

INSERT INTO catalog_items (kind, code, name, "publicPrice", "priceStatus", "priceVerifiedBy", "priceVerifiedAt", notes, "updatedAt")
VALUES
  ('SERVICE', 'PM-SVC-SELF-PAY-FIRST-VISIT',  'Self Pay 1st Visit',                     125.00, 'VERIFIED', 'Devin', NOW(), 'Paciente sin seguro · primera visita.', NOW()),
  ('SERVICE', 'PM-SVC-SELF-PAY-FOLLOW-UP',    'Self Pay Follow-Up Visit',               100.00, 'VERIFIED', 'Devin', NOW(), 'Paciente sin seguro · visitas siguientes.', NOW()),
  ('SERVICE', 'PM-SVC-DIRECT-CARE-VISIT',     'Direct Care Visit Copay',                 10.00, 'VERIFIED', 'Devin', NOW(), 'Copago de atención directa. El plan paga aparte.', NOW()),
  ('SERVICE', 'PM-SVC-APOLLO-DIRECT-CARE',    'Apollo Primary Direct Care Visit Copay',  10.00, 'VERIFIED', 'Devin', NOW(), 'Copago de atención directa para pacientes del plan Apollo.', NOW())
ON CONFLICT (code) DO UPDATE
  SET name          = EXCLUDED.name,
      "publicPrice" = EXCLUDED."publicPrice",
      "isActive"    = true,
      "isOrderable" = true,
      "deletedAt"   = NULL,
      "updatedAt"   = NOW();

COMMIT;

-- ============================================================
-- VERIFICACIÓN — las 4 filas tienen que salir con `ok` en true.
-- ============================================================
--
-- No alcanza con que la fila exista: se comprueba que cumpla las CUATRO
-- condiciones por las que el selector de cobro la va a mostrar en la sección de
-- efectivo (activo, ordenable, sin borrar y con precio > 0). Una fila creada
-- que no aparece en pantalla es exactamente el resultado que hay que evitar.

WITH esperado(code, nombre, precio) AS (VALUES
  ('PM-SVC-SELF-PAY-FIRST-VISIT', 'Self Pay 1st Visit',                    125.00),
  ('PM-SVC-SELF-PAY-FOLLOW-UP',   'Self Pay Follow-Up Visit',              100.00),
  ('PM-SVC-DIRECT-CARE-VISIT',    'Direct Care Visit Copay',                10.00),
  ('PM-SVC-APOLLO-DIRECT-CARE',   'Apollo Primary Direct Care Visit Copay',  10.00)
)
SELECT
  e.code,
  c.name,
  c."publicPrice",
  c.kind::text                                            AS kind,
  (c."cptCode" IS NULL)                                   AS sin_codigo_de_seguro,
  (
    c.name = e.nombre
    AND c."publicPrice" = e.precio
    AND c.kind::text = 'SERVICE'
    AND c."isActive"  IS TRUE
    AND c."isOrderable" IS TRUE
    AND c."deletedAt" IS NULL
    AND c."publicPrice" > 0
  )                                                        AS ok
FROM esperado e
LEFT JOIN catalog_items c ON c.code = e.code
ORDER BY e.code;
