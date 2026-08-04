-- =============================================================================
-- Cobertura del caso (¿tiene seguro?) + cargos del catálogo cash en una visita
-- 2026-08-04
-- =============================================================================
-- Dos cosas que van juntas porque una habilita a la otra:
--
--  1. `cases.coverageType` — quién paga la visita. Dato OPERATIVO para el staff
--     clínico (recepción, asistentes, doctores), no para facturación. Hoy la
--     única señal es `primaryInsuranceId`, que exige elegir el carrier
--     normalizado; ese peaje es la razón por la que el dato está vacío. Esto se
--     responde en 2 clicks con el paciente delante.
--
--  2. `appointment_services` — los servicios e inyectables del catálogo cash
--     (`catalog_items` kind INJECTION/SERVICE) cobrados en una visita. Hasta hoy
--     ese catálogo no tenía NINGUNA vía para llegar a la cita ni a la factura:
--     solo se podía mirar en el modal de precios del mostrador. Es decir, a un
--     paciente sin seguro no se le podía cobrar una inyección.
--
-- DDL a mano (equivalente a `prisma db push`) por el mismo motivo que
-- 20260803-appointment-braces.sql: el session pooler de Supabase (:5432) que
-- necesita el migration engine no responde, y `db push` empujaría todo el
-- schema.prisma. Esto agrega 3 tipos, 1 tabla y 7 columnas.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- =============================================================================

-- ─── 1. Cobertura ───────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "coverage_type" AS ENUM ('UNKNOWN', 'INSURANCE', 'SELF_PAY', 'LIEN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "coverage_verify_method" AS ENUM ('DECLARED', 'VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "cases"
    ADD COLUMN IF NOT EXISTS "coverageType"         "coverage_type" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS "coverageVerifyMethod" "coverage_verify_method",
    ADD COLUMN IF NOT EXISTS "coverageVerifiedAt"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "coverageVerifiedById" TEXT,
    -- Nombre denormalizado: el chip muestra "verificado · Ana R." sin un join a
    -- `users` en cada fila de Mi Día. Mismo criterio que dispensedByName.
    ADD COLUMN IF NOT EXISTS "coverageVerifiedByName" TEXT,
    ADD COLUMN IF NOT EXISTS "coverageCarrierName"  TEXT,
    ADD COLUMN IF NOT EXISTS "coverageNote"         TEXT;

CREATE INDEX IF NOT EXISTS "cases_coverageType_idx" ON "cases"("coverageType");

-- Backfill conservador: los casos que YA tienen carrier normalizado son seguro,
-- pero quedan como DECLARED — nadie llamó a verificarlos. Marcarlos VERIFIED
-- sería exactamente la mentira que este cambio viene a eliminar.
--
-- Los que solo tienen el seguro en `patients.consents->insurances` NO se tocan:
-- ese JSON tiene carrier en texto libre y entradas a medio llenar. Quedan en
-- UNKNOWN y el chip los muestra como pregunta abierta, que es la verdad.
UPDATE "cases"
   SET "coverageType"         = 'INSURANCE',
       "coverageVerifyMethod" = 'DECLARED'
 WHERE "primaryInsuranceId" IS NOT NULL
   AND "coverageType" = 'UNKNOWN';

-- ─── 2. Cargos del catálogo cash ────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "cash_service_status" AS ENUM ('CHARGED', 'VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "appointment_services" (
    "id"            TEXT                  NOT NULL,
    "appointmentId" TEXT                  NOT NULL,
    "visitNoteId"   TEXT,

    -- Item del catálogo. Sin FK a propósito: el catálogo es soft-delete y el
    -- cargo no debe desaparecer si el item se retira.
    "catalogItemId" INTEGER,

    -- Snapshot al momento de cobrar: si mañana cambia el precio, esta visita
    -- sigue mostrando lo que realmente se cobró.
    "code"          TEXT                  NOT NULL,
    "name"          TEXT                  NOT NULL,
    "unitPrice"     DECIMAL(10,2)         NOT NULL,
    -- Evidencia de que se cobró en efectivo algo que era facturable a seguro.
    -- No se usa para facturar: el paciente ya lo pagó.
    "cptCode"       TEXT,
    "unitLabel"     TEXT,

    "quantity"      INTEGER               NOT NULL DEFAULT 1,

    "status"        "cash_service_status" NOT NULL DEFAULT 'CHARGED',
    "voidedAt"      TIMESTAMP(3),
    "voidReason"    TEXT,
    "notes"         TEXT,

    -- Puede cargarlo el doctor o el asistente
    "chargedByName" TEXT,
    "chargedAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "appointment_services_appointmentId_idx" ON "appointment_services"("appointmentId");
CREATE INDEX IF NOT EXISTS "appointment_services_visitNoteId_idx"   ON "appointment_services"("visitNoteId");
CREATE INDEX IF NOT EXISTS "appointment_services_status_idx"        ON "appointment_services"("status");

DO $$ BEGIN
    ALTER TABLE "appointment_services"
        ADD CONSTRAINT "appointment_services_appointmentId_fkey"
        FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "appointment_services"
        ADD CONSTRAINT "appointment_services_visitNoteId_fkey"
        FOREIGN KEY ("visitNoteId") REFERENCES "visit_notes"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Puente a facturación, igual que las férulas: la fila de cobro se identifica
-- por el REGISTRO del cargo, no por su código. Dos aplicaciones del mismo
-- inyectable son dos cobros; agrupar por código los colapsaría (es el bug que
-- sigue vivo en sync-billing con los CPT repetidos).
ALTER TABLE "appointment_billing" ADD COLUMN IF NOT EXISTS "cashServiceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_billing_cashServiceId_key"
    ON "appointment_billing"("cashServiceId") WHERE "cashServiceId" IS NOT NULL;
