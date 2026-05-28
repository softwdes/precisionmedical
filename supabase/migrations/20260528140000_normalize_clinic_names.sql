-- =============================================================
-- Normalize clinic_name values to match public.clinics.name
-- =============================================================
-- After moving clinics into a first-class table (migration
-- 20260528130000), an audit of existing data found:
--   * attendance_records: all clinic_name values match clinics.name
--     (Bolivia, Perú, Provo Clinic, etc.) — no cleanup needed.
--   * work_schedules: 2 rows had clinic_name='Provo' (legacy free-form
--     input from before the table existed). Normalizing to
--     'Provo Clinic' so future JOINs against clinics by name work.
--
-- This is a one-shot data fix, idempotent (the WHERE clause is a
-- no-op once applied).
-- =============================================================

UPDATE public.work_schedules
SET clinic_name = 'Provo Clinic'
WHERE clinic_name = 'Provo';

-- Defensive: also catch obvious legacy variants if they appear later
-- (case differences, missing word). Currently no-ops based on the
-- audit but keep the surface area documented.
UPDATE public.work_schedules
SET clinic_name = 'Provo Clinic'
WHERE LOWER(TRIM(clinic_name)) IN ('provo', 'provo clinic')
  AND clinic_name <> 'Provo Clinic';
