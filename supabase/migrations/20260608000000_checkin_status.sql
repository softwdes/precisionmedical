-- =============================================================
-- B.14 Check-in: nuevo status CHECKED_IN + timestamp checkedInAt
-- =============================================================
-- Flujo admisión del día:
--   SCHEDULED/CONFIRMED → (check-in B.14) → CHECKED_IN
--   CHECKED_IN → (pasar a sala B.15) → IN_PROGRESS
--   IN_PROGRESS → (visita completa) → COMPLETED
-- =============================================================

-- Agregar el nuevo valor al enum (idempotente en Postgres 12+)
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN' BEFORE 'IN_PROGRESS';

-- Agregar timestamp de check-in al appointment
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMP;
