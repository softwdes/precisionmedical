-- =============================================================
-- Attendance location_status: geofencing classification column
-- =============================================================
-- Values:
--   verified      → empleado estaba dentro del radio de la clínica ✅
--   out_of_range  → tiene GPS pero estaba lejos de la clínica ⚠️
--   low_accuracy  → accuracy > 500m (PC sin GPS / WiFi débil) 📡
--   no_permission → negó permiso o sin servicio de ubicación 🚫
--   remote        → clínica sin coordenadas (Bolivia / Perú) 🌎
--   unknown       → fallback (registros anteriores a esta migración)
-- =============================================================

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS location_status text
    DEFAULT 'unknown'
    CHECK (location_status IN (
      'verified',
      'out_of_range',
      'low_accuracy',
      'no_permission',
      'remote',
      'unknown'
    ));

-- Backfill: registros anteriores sin coords → no_permission
-- Registros con coords pero sin validación → unknown (no podemos verificar sin coords de clínica en DB)
UPDATE public.attendance_records
SET location_status = 'no_permission'
WHERE (location_status IS NULL OR location_status = 'unknown')
  AND check_in_lat IS NULL;
