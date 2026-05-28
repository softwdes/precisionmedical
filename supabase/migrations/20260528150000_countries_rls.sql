-- =============================================================
-- Countries: open SELECT for authenticated users
-- =============================================================
-- The countries table was created by Prisma (model Country: id,
-- code, name, currency) but never got Supabase grants/RLS, so
-- queries from the client-side supabase-js (anon/authenticated)
-- would fail.
--
-- The timeclock now needs to read the employee's country.code
-- (US/BO/PE) to filter the clinic dropdown. Adding the standard
-- "any authenticated user can read" policy in line with how we
-- treat clinics.
-- =============================================================

GRANT SELECT ON public.countries TO authenticated;

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "countries_select_all_authenticated" ON public.countries;

CREATE POLICY "countries_select_all_authenticated"
  ON public.countries FOR SELECT TO authenticated
  USING (true);
