-- =============================================================
-- Clinics: per-clinic strict geofencing toggle
-- =============================================================
-- Adds a boolean per clinic to enforce geofencing on clock-in.
-- When strict_geofencing = true, the timeclock blocks clock-in
-- if location_status is 'out_of_range' or 'no_permission'.
-- Default false to preserve current permissive behavior; admin
-- opts in per clinic once the coordinates are verified.
--
-- Why per-clinic and not global: we have 7 clinics with very
-- different confidence levels (5 Utah with approximate coords,
-- Bolivia/Perú still without coords). A global flag would force
-- all or nothing.
-- =============================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS strict_geofencing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinics.strict_geofencing IS
  'When true, the PM Time Clock blocks clock-in if location_status is not verified/remote. Default false (permissive with warning).';
