-- =============================================================================
-- Referidos desde el portal legal — 2026-09-07 · proyecto PHOENIX
-- =============================================================================
-- Botón "¿Tenés un referido?" en Vigía: el abogado manda los datos del cliente y
-- del accidente, le llega como MENSAJE (tipo REFERRAL, escritorio REFERRALS) a
-- Reagin / Carolina / Pamela / Beatriz, y quien lo abre aprieta "Crear el caso"
-- y el wizard de nuevo caso se abre precargado. Los datos van en `firm_referrals`
-- (JSON), no en el cuerpo del mensaje; el `status` evita que cuatro personas
-- creen el mismo paciente.
--
-- Idempotente. `ALTER TYPE … ADD VALUE` no puede compartir transacción con una
-- sentencia que USE el valor nuevo — acá ninguna lo usa (la tabla referencia el
-- tipo, no el valor), así que puede correr de un tirón en el SQL Editor.
-- =============================================================================

ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'REFERRAL';
ALTER TYPE "message_desk" ADD VALUE IF NOT EXISTS 'REFERRALS';

CREATE TABLE IF NOT EXISTS "firm_referrals" (
  "id"                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "firmId"             text NOT NULL,
  "attorneyLawyerId"   text,
  "sentByUserId"       text NOT NULL,
  "sentByName"         text NOT NULL,
  "threadId"           text NOT NULL UNIQUE REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "payload"            jsonb NOT NULL,
  "status"             text NOT NULL DEFAULT 'PENDING',
  "posiblesDuplicados" jsonb,
  "caseId"             text,
  "patientId"          text,
  "convertedByUserId"  text,
  "convertedByName"    text,
  "convertedAt"        timestamp(3),
  "createdAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "firm_referrals_firmId_idx" ON "firm_referrals" ("firmId");
CREATE INDEX IF NOT EXISTS "firm_referrals_status_idx" ON "firm_referrals" ("status");

NOTIFY pgrst, 'reload schema';
