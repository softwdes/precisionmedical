-- ─────────────────────────────────────────────────────────────────────────────
-- Premios del Staff · aprobación del mes
--
-- Erick (2026-10-01): las metas se cuentan solas, pero la plata la APRUEBA el
-- Admin. El flujo es Por ganar → Revisión → Aprobado:
--
--   · Durante el mes el monto es provisional ("por ganar").
--   · Terminado el mes, el Admin revisa y puede AJUSTAR una meta de alguien
--     (sumar o restar, siempre con motivo; el empleado lo ve).
--   · Aprueba por persona o en bloque. Aprobar CONGELA el resultado de esa
--     persona en `reward_participants`: nada de lo que pase después lo mueve.
--   · Con todos aprobados, el mes se cierra (status CLOSED).
--
-- Los supervisores se aprueban al final: su monto sale del promedio del staff.
--
-- Se aplica con:
--   cd packages/database && node scripts/apply-sql.cjs prisma/sql/20261001-premios-aprobacion.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE reward_participants ADD COLUMN IF NOT EXISTS "approvedAt"       TIMESTAMP(3);
ALTER TABLE reward_participants ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT REFERENCES users(id);
-- El resultado congelado al aprobar: metas (actual/objetivo/cumplida), puntos y monto.
ALTER TABLE reward_participants ADD COLUMN IF NOT EXISTS "frozenResult"     JSONB;

-- Ajustes del Admin en la revisión: +/− sobre lo que contó el sistema en UNA meta.
CREATE TABLE IF NOT EXISTS reward_adjustments (
  id                TEXT PRIMARY KEY,
  "periodId"        TEXT NOT NULL REFERENCES reward_periods(id) ON DELETE CASCADE,
  "userId"          TEXT NOT NULL REFERENCES users(id),
  "goalId"          TEXT NOT NULL REFERENCES reward_goals(id) ON DELETE CASCADE,
  delta             INT  NOT NULL CHECK (delta <> 0),
  reason            TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  "createdByUserId" TEXT REFERENCES users(id),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS reward_adjustments_period_user_idx ON reward_adjustments ("periodId", "userId");

GRANT SELECT, INSERT, UPDATE, DELETE ON reward_adjustments TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
