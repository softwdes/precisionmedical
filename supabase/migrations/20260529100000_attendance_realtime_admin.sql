-- =============================================================
-- Attendance live updates for the admin Asistencia view
-- =============================================================
-- Two things needed for Supabase Realtime to deliver attendance
-- events to the admin browser:
--
--   1. The tables must be in the supabase_realtime publication
--      (otherwise no changes are broadcast at all).
--   2. RLS must allow admin roles to SELECT — Realtime respects
--      RLS, so without an admin-scoped policy the browser channel
--      subscribes but never receives anything (the existing
--      timeclock_attendance_select_own policy only matches the
--      employee themselves).
--
-- The REST endpoint /api/attendance/today uses a service-role
-- supabase client and bypasses RLS, so it kept working. Only the
-- Realtime browser channel was silent.
-- =============================================================

-- ── Publication: add the tables that the admin listens to ─────
-- IF NOT EXISTS doesn't work on ALTER PUBLICATION ADD TABLE, so
-- we guard with a DO block that checks pg_publication_tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_waypoints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_waypoints;
  END IF;
END $$;

-- ── RLS: admin roles can SELECT all attendance ────────────────
-- Adds an ADDITIONAL policy. The existing timeclock_*_select_own
-- policies remain untouched — employees still see only their own
-- rows; admins now also see everyone's via this new policy.

DROP POLICY IF EXISTS "admin_attendance_select_all" ON public.attendance_records;
CREATE POLICY "admin_attendance_select_all"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.role IN ('SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'AUDITOR_AI')
        AND u."deletedAt" IS NULL
    )
  );

DROP POLICY IF EXISTS "admin_waypoints_select_all" ON public.attendance_waypoints;
CREATE POLICY "admin_waypoints_select_all"
  ON public.attendance_waypoints FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = (auth.jwt() ->> 'email')
        AND u.role IN ('SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'AUDITOR_AI')
        AND u."deletedAt" IS NULL
    )
  );
