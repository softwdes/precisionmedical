-- =============================================================================
-- Mensajería interna (M1) — módulo Clínica + portal Doctor
-- 2026-08-07
-- =============================================================================
-- Correo interno entre usuarios, calcado del EMR legacy (MedPrime). El hilo
-- casi siempre nace anclado a un paciente (patientId/caseId opcionales) y vive
-- en dos capas independientes: los INBOXES de los destinatarios y el HISTORIAL
-- del paciente. Ver el comentario de cabecera del módulo en schema.prisma.
--
-- DDL a mano (equivalente a `prisma db push`) por el mismo motivo que
-- 20260804-coverage-and-cash-services.sql: el session pooler de Supabase
-- (:5432) que necesita el migration engine no responde, y `db push` empujaría
-- todo el schema.prisma. Esto agrega 5 tipos y 4 tablas.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- =============================================================================

-- ─── 1. Enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "message_type" AS ENUM ('ALERT', 'REMINDER', 'REQUEST', 'MESSAGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "message_category" AS ENUM ('GENERAL', 'PHONE_MESSAGE', 'PATIENT_RELATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "message_priority" AS ENUM ('NORMAL', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "message_entry_kind" AS ENUM ('MESSAGE', 'REPLY', 'FORWARD', 'NOTE', 'SEAL_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "message_recipient_kind" AS ENUM ('TO', 'CC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Hilos ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "message_threads" (
    "id"                   TEXT NOT NULL,
    "subject"              TEXT NOT NULL,
    "type"                 "message_type" NOT NULL DEFAULT 'MESSAGE',
    "category"             "message_category" NOT NULL DEFAULT 'GENERAL',
    "priority"             "message_priority" NOT NULL DEFAULT 'NORMAL',

    "patientId"            TEXT,
    "caseId"               TEXT,

    "createdByUserId"      TEXT NOT NULL,
    "createdByName"        TEXT NOT NULL,

    -- Sello (Move to Patient Folder): congela lo previo, saca de los inboxes.
    "sealedAt"             TIMESTAMP(3),
    "sealedByUserId"       TEXT,
    "sealedByName"         TEXT,

    -- Delete From All: fuera de todos los inboxes, intacto en el paciente.
    "removedFromInboxesAt" TIMESTAMP(3),

    -- Borrado desde el historial del paciente (soft, solo admin).
    "deletedAt"            TIMESTAMP(3),
    "deletedByUserId"      TEXT,

    -- Denormalizado: sentAt de la última entrada (orden + bold de inboxes).
    "lastEntryAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "message_threads"
        ADD CONSTRAINT "message_threads_patientId_fkey" FOREIGN KEY ("patientId")
        REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "message_threads"
        ADD CONSTRAINT "message_threads_caseId_fkey" FOREIGN KEY ("caseId")
        REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "message_threads_patientId_idx"   ON "message_threads"("patientId");
CREATE INDEX IF NOT EXISTS "message_threads_caseId_idx"      ON "message_threads"("caseId");
CREATE INDEX IF NOT EXISTS "message_threads_lastEntryAt_idx" ON "message_threads"("lastEntryAt");
CREATE INDEX IF NOT EXISTS "message_threads_deletedAt_idx"   ON "message_threads"("deletedAt");

-- ─── 3. Entradas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "message_entries" (
    "id"           TEXT NOT NULL,
    "threadId"     TEXT NOT NULL,
    "kind"         "message_entry_kind" NOT NULL DEFAULT 'MESSAGE',
    "authorUserId" TEXT NOT NULL,
    "authorName"   TEXT NOT NULL,
    "body"         TEXT NOT NULL,
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_entries_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "message_entries"
        ADD CONSTRAINT "message_entries_threadId_fkey" FOREIGN KEY ("threadId")
        REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "message_entries_threadId_sentAt_idx" ON "message_entries"("threadId", "sentAt");
CREATE INDEX IF NOT EXISTS "message_entries_authorUserId_idx"    ON "message_entries"("authorUserId");

-- ─── 4. Destinatarios (read-state + delete personal) ─────────────────────────

CREATE TABLE IF NOT EXISTS "message_recipients" (
    "threadId"   TEXT NOT NULL,
    "userId"     TEXT NOT NULL, -- users.id (cuid Phoenix), NO el UUID de Auth
    "userName"   TEXT NOT NULL,
    "kind"       "message_recipient_kind" NOT NULL DEFAULT 'TO',
    "lastReadAt" TIMESTAMP(3),
    "deletedAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("threadId", "userId")
);

DO $$ BEGIN
    ALTER TABLE "message_recipients"
        ADD CONSTRAINT "message_recipients_threadId_fkey" FOREIGN KEY ("threadId")
        REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "message_recipients_userId_deletedAt_idx" ON "message_recipients"("userId", "deletedAt");

-- ─── 5. Adjuntos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "message_attachments" (
    "id"                TEXT NOT NULL,
    "entryId"           TEXT NOT NULL,
    "patientDocumentId" TEXT, -- sin FK: el doc puede borrarse, el adjunto queda como evidencia
    "fileUrl"           TEXT,
    "fileName"          TEXT NOT NULL,
    "documentType"      TEXT,
    "description"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "message_attachments"
        ADD CONSTRAINT "message_attachments_entryId_fkey" FOREIGN KEY ("entryId")
        REFERENCES "message_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "message_attachments_entryId_idx" ON "message_attachments"("entryId");
