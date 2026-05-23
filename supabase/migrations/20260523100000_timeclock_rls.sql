-- =============================================================
-- PM Time Clock — RLS & grants for Prisma-managed tables
-- =============================================================
-- Prisma creates tables without Supabase role grants.
-- This migration adds the minimum grants + policies the timeclock
-- needs so authenticated employees can read/write their own data.
-- =============================================================

-- ── employees ─────────────────────────────────────────────────
GRANT SELECT ON public.employees TO authenticated;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Each employee can read only their own record (matched by email)
CREATE POLICY "timeclock_employees_select_own"
  ON public.employees FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

-- ── users (role lookup) ────────────────────────────────────────
GRANT SELECT ON public.users TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Each user can read their own record
CREATE POLICY "timeclock_users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

-- ── work_schedules (read own schedules) ───────────────────────
GRANT SELECT ON public.work_schedules TO authenticated;

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

-- Employees can read schedules assigned to them
CREATE POLICY "timeclock_schedules_select_own"
  ON public.work_schedules FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── attendance_records (read/write own records) ────────────────
GRANT SELECT, INSERT, UPDATE ON public.attendance_records TO authenticated;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Read own records
CREATE POLICY "timeclock_attendance_select_own"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- Insert own records
CREATE POLICY "timeclock_attendance_insert_own"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- Update own records (clock out, break)
CREATE POLICY "timeclock_attendance_update_own"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (auth.jwt() ->> 'email')
    )
  );
