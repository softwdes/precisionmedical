-- Work schedules for PM Time Clock integration
CREATE TABLE IF NOT EXISTS work_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now(),
  employee_id   text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  schedule_type text NOT NULL CHECK (schedule_type IN ('full_time','part_time')),
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  days_of_week  integer[] NOT NULL,
  clinic_name   text NOT NULL,
  valid_from    date NOT NULL,
  valid_until   date,
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz DEFAULT now(),
  employee_id    text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  exception_type text NOT NULL CHECK (exception_type IN ('vacation','absence','holiday','special')),
  date           date NOT NULL,
  reason         text,
  approved_by    uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_schedules_employee ON work_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedules_active    ON work_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_exceptions_employee ON schedule_exceptions(employee_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_date     ON schedule_exceptions(date);
