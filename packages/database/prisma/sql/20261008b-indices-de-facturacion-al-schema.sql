-- ────────────────────────────────────────────────────────────────────────────
-- Destrabar `prisma db push`: los dos únicos de appointment_billing
--
-- `prisma db push` falla para TODAS las sesiones desde hace días con:
--
--     relation "appointment_billing_braceId_key" already exists
--
-- No es un problema de quien lo corre. El schema declara `braceId String? @unique`
-- y `cashServiceId String? @unique`, o sea índices únicos COMPLETOS; la base los
-- tiene con el MISMO NOMBRE pero PARCIALES:
--
--     CREATE UNIQUE INDEX "appointment_billing_braceId_key"
--         ON appointment_billing ("braceId") WHERE ("braceId" IS NOT NULL);
--
-- Prisma intenta crear el completo, el nombre ya está tomado y aborta. Y como
-- aborta a mitad de camino, puede dejar aplicada parte de la tanda: el 2026-10-07
-- creó tres columnas de `prescriptions` y después falló acá.
--
-- Vienen de `20260803-appointment-braces.sql` y
-- `20260804-coverage-and-cash-services.sql`, escritos a mano antes de que la
-- columna estuviera en el schema.
--
-- ── Por qué convertirlos NO cambia nada ──────────────────────────────────────
--
-- En PostgreSQL un índice único sobre una columna que acepta NULL **ya ignora los
-- NULL**: dos filas con NULL nunca chocan entre sí. O sea que
--
--     UNIQUE (braceId)                            ← lo que pide el schema
--     UNIQUE (braceId) WHERE braceId IS NOT NULL  ← lo que hay en la base
--
-- hacen exactamente lo mismo. El `WHERE` no agregaba nada.
--
-- Probado el 2026-10-08 contra esta misma base, con los dos controles:
--   · 3 filas con NULL en una columna UNIQUE  → entraron las 3   ✔
--   · 2 filas con el mismo valor              → rechazadas       ✔
--
-- Y medido antes de tocar: braceId tiene 30 valores no nulos, los 30 distintos,
-- y 6.761 NULL. cashServiceId, igual situación. No hay nada que el índice nuevo
-- vaya a rechazar.
--
-- ── ⚠️ Lo que este archivo NO toca, a propósito ─────────────────────────────
--
-- `appointment_billing_cpt_unique` es un índice compuesto parcial hecho a mano en
-- `20260813-billing-cpt-unique.sql`, y ahí el `WHERE` **sí significa algo**: tapa
-- la condición de carrera que facturaba $140 donde la pantalla mostraba $70, y
-- deja a propósito que las férulas, el efectivo y los labs repitan código en la
-- misma cita. Prisma no sabe expresarlo.
--
-- Se verificó con `prisma migrate diff` (solo lectura) que la tanda pendiente
-- **no lo borra ni lo menciona**: son 3 CreateIndex, 28 RenameIndex, 9
-- RenameForeignKey y 5 AddForeignKey, y CERO DROP de cualquier tipo.
-- Igual: si algún día `db push` lo borra, está en ese archivo para recrearlo.
--
-- Idempotente: se puede correr de nuevo sin efecto.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- El DROP + CREATE va junto dentro de la transacción: `DROP INDEX` toma un
-- candado exclusivo sobre la tabla, así que no hay ni un instante en el que otra
-- sesión pueda colar un duplicado mientras el único no está.

-- ── braceId ────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "appointment_billing_braceId_key";

CREATE UNIQUE INDEX "appointment_billing_braceId_key"
    ON "appointment_billing" ("braceId");

-- ── cashServiceId ──────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "appointment_billing_cashServiceId_key";

CREATE UNIQUE INDEX "appointment_billing_cashServiceId_key"
    ON "appointment_billing" ("cashServiceId");

COMMIT;

-- Después de esto, `pnpm --filter @precision-medical/database db:push` deja de
-- chocar. Lo que le queda por aplicar son renombres de claves foráneas e índices
-- (convención de nombres de Prisma), un índice nuevo en case_tracking y cinco
-- claves foráneas que faltaban.
