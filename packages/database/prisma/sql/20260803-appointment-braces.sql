-- =============================================================================
-- Férulas / DME entregados en una visita
-- 2026-08-03
-- =============================================================================
-- Tabla propia (no una línea del JSON `plannedServiceCodes`) porque cada entrega
-- es un hecho clínico y contable: lleva lado, talla y cantidad.
--
-- DDL escrito a mano (equivalente a `prisma db push`) por dos razones:
--  1. El session pooler de Supabase (:5432) que necesita el migration engine no
--     responde — mismo motivo que 20260803-catalog-items.sql.
--  2. `db push` empujaría TODO el schema.prisma, y hoy tiene cambios en curso de
--     otra rama de trabajo. Esto solo agrega 2 tipos y 1 tabla.
--
-- No modifica ninguna tabla existente.
-- =============================================================================

CREATE TYPE "brace_side" AS ENUM ('NA', 'LEFT', 'RIGHT');

CREATE TYPE "brace_status" AS ENUM ('DISPENSED', 'RETURNED', 'VOIDED');

CREATE TABLE "appointment_braces" (
    "id"              TEXT           NOT NULL,
    "appointmentId"   TEXT           NOT NULL,
    "visitNoteId"     TEXT,

    -- Item del catálogo. Sin FK a propósito: el catálogo es soft-delete y la
    -- entrega no debe desaparecer si el item se retira.
    "catalogItemId"   INTEGER,

    -- Snapshot del catálogo al momento de entregar: si mañana cambia el precio
    -- o el HCPCS, esta visita sigue mostrando lo que realmente se cobró.
    "code"            TEXT           NOT NULL,
    "name"            TEXT           NOT NULL,
    "sizeLabel"       TEXT,
    "hcpcsCode"       TEXT,
    "unitPrice"       DECIMAL(10,2)  NOT NULL,

    "side"            "brace_side"   NOT NULL DEFAULT 'NA',
    "quantity"        INTEGER        NOT NULL DEFAULT 1,

    "status"          "brace_status" NOT NULL DEFAULT 'DISPENSED',
    "voidedAt"        TIMESTAMP(3),
    "voidReason"      TEXT,
    "notes"           TEXT,

    -- Puede entregarla el doctor o el asistente
    "dispensedByName" TEXT,
    "dispensedAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_braces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_braces_appointmentId_idx" ON "appointment_braces"("appointmentId");
CREATE INDEX "appointment_braces_visitNoteId_idx"   ON "appointment_braces"("visitNoteId");
CREATE INDEX "appointment_braces_status_idx"        ON "appointment_braces"("status");

ALTER TABLE "appointment_braces"
    ADD CONSTRAINT "appointment_braces_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_braces"
    ADD CONSTRAINT "appointment_braces_visitNoteId_fkey"
    FOREIGN KEY ("visitNoteId") REFERENCES "visit_notes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Puente a facturación: la fila de cobro se identifica por el REGISTRO de la
-- férula, no por su código. Dos férulas del mismo modelo (izquierda y derecha)
-- son dos cobros distintos, y agrupar por código los colapsaría — es el mismo
-- error que hoy tiene sync-billing con los CPT repetidos.
ALTER TABLE "appointment_billing" ADD COLUMN IF NOT EXISTS "braceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_billing_braceId_key"
    ON "appointment_billing"("braceId") WHERE "braceId" IS NOT NULL;
