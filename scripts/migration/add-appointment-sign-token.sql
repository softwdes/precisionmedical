-- Migration: token de firma de confirmacion de cita (2026-08-31)
-- Run this in Supabase SQL editor o con el runner por :6543
-- Safe: solo ADD COLUMN + CREATE INDEX IF NOT EXISTS (no drops, no data loss)
--
-- Por que un token en la tabla y no un JWT: se puede REVOCAR (poner en NULL) y
-- no depende de un secret en env — ver la mordida del secret de ScriptSure que
-- Next.js mutilo por el `$`.
--
-- `signTokenExpiresAt` SE VALIDA en la ruta publica. No repetir lo de
-- `cases.portalToken`, que muestra "expira en 24 h" y no vence nunca.

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "signToken"          TEXT,
  ADD COLUMN IF NOT EXISTS "signTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_signToken_key"
  ON "appointments" ("signToken");
