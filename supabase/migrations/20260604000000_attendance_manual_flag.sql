-- =============================================================
-- Marcación manual / retroactiva de asistencia
-- =============================================================
-- Permite que el admin cree (o corrija) registros cuando el
-- empleado se olvidó de marcar. Estos registros NO tienen GPS,
-- por eso se distinguen con:
--   is_manual = true         → flag dedicado para auditoría/badges
--   location_status='manual' → no contamina el filtro "sin GPS"
-- recorded_by ya guarda QUIÉN lo creó (ver POST /api/attendance).
-- =============================================================

-- 1) Flag de registro manual
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

-- 2) Agregar 'manual' al CHECK de location_status. El constraint
--    fue creado inline en la migración 20260525000000, así que
--    Postgres lo nombró attendance_records_location_status_check.
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_location_status_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_location_status_check
  CHECK (location_status IN (
    'verified',
    'out_of_range',
    'low_accuracy',
    'no_permission',
    'remote',
    'manual',
    'unknown'
  ));
