-- =============================================================
-- Clinics: first-class entity for geofencing & assignment
-- =============================================================
-- Until now the list of clinics lived as a hardcoded array in
-- apps/timeclock/components/ClockPage.tsx — every coordinate or
-- name change required a deploy. Other tables (work_schedules,
-- attendance_records, employees) reference clinics by free-form
-- "clinic_name" text. This migration keeps that contract intact
-- (clinics.name preserves the legacy strings) while moving the
-- geo data to the DB so the admin can edit coords without code
-- changes.
--
-- Future steps:
--   * Admin UI to CRUD clinics (Configuración → Clínicas).
--   * Eventually migrate columns to FK clinic_id (separate effort,
--     invasive — out of scope here).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.clinics (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,             -- legacy key, matches *_records.clinic_name
  display_name  text        NOT NULL,                    -- what employees see in the dropdown
  country       text        NOT NULL,                    -- 'US' | 'BO' | 'PE'
  lat           double precision,                        -- null = no geofence (remote)
  lng           double precision,
  radius_m      integer,                                 -- null = no geofence; default sugerido 250
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinics_active  ON public.clinics (is_active);
CREATE INDEX IF NOT EXISTS idx_clinics_country ON public.clinics (country);

-- ── Seed: 5 Utah + La Paz + Arequipa ──────────────────────────
-- Utah coords are approximations to the city center (same values
-- the hardcoded array had). Update with the real clinic address
-- when confirmed.
-- Bolivia/Perú left without coords for now (location_status =
-- 'remote' — same behavior as before). Admin can fill them in via
-- Supabase Studio when the addresses are confirmed.
INSERT INTO public.clinics (name, display_name, country, lat, lng, radius_m) VALUES
  ('Provo Clinic',           'Provo Clinic',          'US',  40.2338, -111.6585, 300),
  ('Pleasant Grove Clinic',  'Pleasant Grove Clinic', 'US',  40.3638, -111.7385, 300),
  ('Spanish Fork Clinic',    'Spanish Fork Clinic',   'US',  40.1149, -111.6549, 300),
  ('West Valley Clinic',     'West Valley Clinic',    'US',  40.6916, -112.0010, 300),
  ('South Murray Clinic',    'South Murray Clinic',   'US',  40.6469, -111.8980, 300),
  ('Bolivia',                'La Paz, Bolivia',       'BO',  NULL,    NULL,      NULL),
  ('Perú',                   'Arequipa, Perú',        'PE',  NULL,    NULL,      NULL)
ON CONFLICT (name) DO NOTHING;

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_clinics_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinics_updated_at ON public.clinics;
CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.touch_clinics_updated_at();

-- ── RLS: any authenticated user can read the active list ──────
GRANT SELECT ON public.clinics TO authenticated;

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinics_select_all_authenticated" ON public.clinics;

CREATE POLICY "clinics_select_all_authenticated"
  ON public.clinics FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE restringidos al service role (admin app
-- usa supabaseAdmin desde routers tRPC). Si se necesita editar
-- via Supabase Studio basta con login como service role.
