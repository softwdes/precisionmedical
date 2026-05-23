-- PM Time Clock — attendance_records table
-- employee_id is TEXT to match employees.id (Prisma CUID)
-- schedule_id is UUID to match work_schedules.id (gen_random_uuid)

CREATE TABLE IF NOT EXISTS attendance_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz DEFAULT now(),

  employee_id    text        NOT NULL
                             REFERENCES employees(id)
                             ON DELETE CASCADE,

  date           date        NOT NULL DEFAULT CURRENT_DATE,
  check_in       timestamptz,
  check_out      timestamptz,
  break_start    timestamptz,
  break_end      timestamptz,

  clinic_name    text        NOT NULL,
  hours_worked   decimal(5,2),
  break_minutes  integer     DEFAULT 0,

  status         text        DEFAULT 'on_time'
                             CHECK (status IN ('on_time','late','absent')),

  late_minutes   integer     DEFAULT 0,

  schedule_id    uuid
                             REFERENCES work_schedules(id),

  notes          text,

  recorded_by    uuid
                             REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee
  ON attendance_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance_records(date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_checkin
  ON attendance_records(check_in)
  WHERE check_out IS NULL;
