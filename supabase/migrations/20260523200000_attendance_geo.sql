-- =============================================================
-- Attendance geolocation: columns + waypoints table
-- =============================================================

-- ── Geo columns on attendance_records ─────────────────────────
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_lat  double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng  double precision,
  ADD COLUMN IF NOT EXISTS check_in_acc  real,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS check_out_acc real;

-- ── Waypoints table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_waypoints (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id   uuid        NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  accuracy    real,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waypoints_record ON attendance_waypoints(record_id);

-- ── RLS ───────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.attendance_waypoints TO authenticated;

ALTER TABLE public.attendance_waypoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeclock_waypoints_select_own" ON public.attendance_waypoints;
DROP POLICY IF EXISTS "timeclock_waypoints_insert_own" ON public.attendance_waypoints;

CREATE POLICY "timeclock_waypoints_select_own"
  ON public.attendance_waypoints FOR SELECT TO authenticated
  USING (
    record_id IN (
      SELECT ar.id FROM public.attendance_records ar
      JOIN public.employees e ON e.id = ar.employee_id
      WHERE e.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "timeclock_waypoints_insert_own"
  ON public.attendance_waypoints FOR INSERT TO authenticated
  WITH CHECK (
    record_id IN (
      SELECT ar.id FROM public.attendance_records ar
      JOIN public.employees e ON e.id = ar.employee_id
      WHERE e.email = (auth.jwt() ->> 'email')
    )
  );
