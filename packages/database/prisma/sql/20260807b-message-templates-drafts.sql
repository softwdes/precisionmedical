-- =============================================================================
-- Mensajería interna F4 — plantillas y borradores
-- 2026-08-07
-- =============================================================================
-- · message_templates — el panel de plantillas del legacy (compartidas por la
--   clínica, borrado soft).
-- · message_drafts — Save as Draft: el compose serializado en `payload`,
--   privado del autor, se elimina al enviar.
--
-- DDL a mano por el mismo motivo que 20260807-internal-messaging.sql (el
-- session pooler :5432 no responde). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "message_templates" (
    "id"              TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName"   TEXT NOT NULL,
    "deletedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "message_templates_deletedAt_idx" ON "message_templates"("deletedAt");

CREATE TABLE IF NOT EXISTS "message_drafts" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "subject"     TEXT,
    "patientId"   TEXT,
    "patientName" TEXT,
    "payload"     JSONB NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "message_drafts_userId_updatedAt_idx" ON "message_drafts"("userId", "updatedAt");
