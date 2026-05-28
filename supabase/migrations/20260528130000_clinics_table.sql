-- =============================================================
-- Clinics: extend existing Prisma-managed table with geofencing
-- =============================================================
-- The table public.clinics already exists (created by Prisma —
-- see packages/database/prisma/schema.prisma model Clinic, with
-- id text/name/address/phone). Nothing in the codebase reads
-- Clinic via Prisma ORM today; appointments router queries it via
-- supabase-js for (id, name, address, phone).
--
-- This migration:
--   * Adds geofencing columns the timeclock needs
--   * Preserves existing columns so appointments.listClinics
--     keeps working
--   * Seeds the 7 known clinics idempotently (UPSERT by name)
--
-- Follow-up: update the Prisma model to mirror the new columns
-- next time `prisma db pull` runs (non-blocking).
-- =============================================================

-- ── Add geofencing columns if missing ─────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS display_name  text,
  ADD COLUMN IF NOT EXISTS country       text,
  ADD COLUMN IF NOT EXISTS lat           double precision,
  ADD COLUMN IF NOT EXISTS lng           double precision,
  ADD COLUMN IF NOT EXISTS radius_m      integer,
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clinics_active  ON public.clinics (is_active);
CREATE INDEX IF NOT EXISTS idx_clinics_country ON public.clinics (country);

-- ── Seed: 7 known clinics (idempotent UPSERT by name) ─────────
-- Note: clinics.id is text (Prisma cuid). gen_random_uuid() is NOT
-- used here — we let the Prisma default expression apply via
-- defaults already set on existing rows, or insert with no id and
-- let any existing default trigger create one. Since the column
-- has a Prisma default of cuid() at the application layer (not DB),
-- we provide an explicit id via a deterministic generator.
-- Easiest: rely on the existing rows; for new ones use gen_random_uuid()
-- cast to text (cuid format is opaque to PG; we use uuid as text).
INSERT INTO public.clinics (id, name, display_name, country, lat, lng, radius_m) VALUES
  (gen_random_uuid()::text, 'Provo Clinic',           'Provo Clinic',          'US',  40.2338, -111.6585, 300),
  (gen_random_uuid()::text, 'Pleasant Grove Clinic',  'Pleasant Grove Clinic', 'US',  40.3638, -111.7385, 300),
  (gen_random_uuid()::text, 'Spanish Fork Clinic',    'Spanish Fork Clinic',   'US',  40.1149, -111.6549, 300),
  (gen_random_uuid()::text, 'West Valley Clinic',     'West Valley Clinic',    'US',  40.6916, -112.0010, 300),
  (gen_random_uuid()::text, 'South Murray Clinic',    'South Murray Clinic',   'US',  40.6469, -111.8980, 300),
  (gen_random_uuid()::text, 'Bolivia',                'La Paz, Bolivia',       'BO',  NULL,    NULL,      NULL),
  (gen_random_uuid()::text, 'Perú',                   'Arequipa, Perú',        'PE',  NULL,    NULL,      NULL)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  country      = EXCLUDED.country,
  -- Preserve coords already set by admin; only fill when currently NULL
  lat          = COALESCE(public.clinics.lat,      EXCLUDED.lat),
  lng          = COALESCE(public.clinics.lng,      EXCLUDED.lng),
  radius_m     = COALESCE(public.clinics.radius_m, EXCLUDED.radius_m);

-- Any pre-existing Prisma rows without display_name get it filled
-- from name, then we lock display_name NOT NULL.
UPDATE public.clinics SET display_name = name WHERE display_name IS NULL;
ALTER TABLE public.clinics ALTER COLUMN display_name SET NOT NULL;

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

-- INSERT/UPDATE/DELETE remain unrestricted from anon/auth (no
-- policies). Admin app uses supabaseAdmin (service role) which
-- bypasses RLS. Future admin UI can either expose a tRPC endpoint
-- with role check or add explicit policies here.
