-- Registro de mensajes salientes al paciente (SMS hoy, email despues).
--
-- Se aplica por SQL y no con `prisma db push` porque el session pooler de
-- Supabase (:5432, el que usa DIRECT_URL para DDL) no responde; el transaction
-- pooler (:6543) si, y para CREATE TYPE/TABLE alcanza.
--
-- Aditivo y reversible:
--   DROP TABLE message_logs; DROP TYPE "MessageStatus"; DROP TYPE "MessageChannel";

DO $$ BEGIN
  CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageStatus" AS ENUM ('QUEUED','SENT','DELIVERED','UNDELIVERED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS message_logs (
  "id"                text            NOT NULL,
  -- SID de Twilio; null si fallo antes de que Twilio lo aceptara
  "providerMessageId" text,
  "channel"           "MessageChannel" NOT NULL,
  "status"            "MessageStatus"  NOT NULL DEFAULT 'QUEUED',
  "toAddress"         text            NOT NULL,
  "fromAddress"       text            NOT NULL,
  -- PHI: puede llevar nombre del paciente y link del portal
  "body"              text            NOT NULL,
  "errorCode"         integer,
  "errorMessage"      text,
  "patientId"         text,
  "caseId"            text,
  "sentByUserId"      text,
  "sentByName"        text,
  "deliveredAt"       timestamp(3),
  "createdAt"         timestamp(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         timestamp(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT message_logs_pkey PRIMARY KEY ("id")
);

-- El webhook de estado cruza por el SID, y tiene que ser unico.
CREATE UNIQUE INDEX IF NOT EXISTS "message_logs_providerMessageId_key"
  ON message_logs ("providerMessageId");

CREATE INDEX IF NOT EXISTS "message_logs_patientId_idx"  ON message_logs ("patientId");
CREATE INDEX IF NOT EXISTS "message_logs_caseId_idx"     ON message_logs ("caseId");
CREATE INDEX IF NOT EXISTS "message_logs_status_idx"     ON message_logs ("status");
CREATE INDEX IF NOT EXISTS "message_logs_createdAt_idx"  ON message_logs ("createdAt");

-- FKs sin ON DELETE CASCADE a proposito: si se borra un paciente, el registro
-- de que le mandamos un mensaje NO se borra — es evidencia de comunicacion.
DO $$ BEGIN
  ALTER TABLE message_logs ADD CONSTRAINT "message_logs_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES patients("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE message_logs ADD CONSTRAINT "message_logs_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES cases("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
