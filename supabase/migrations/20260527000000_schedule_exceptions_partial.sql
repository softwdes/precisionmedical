-- Add partial (by-hour) absence support to schedule_exceptions
-- Adds nullable start_time / end_time columns and extends the type CHECK constraint

ALTER TABLE schedule_exceptions
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time   time;

-- Drop old constraint and recreate with 'partial' included
ALTER TABLE schedule_exceptions
  DROP CONSTRAINT IF EXISTS schedule_exceptions_exception_type_check;

ALTER TABLE schedule_exceptions
  ADD CONSTRAINT schedule_exceptions_exception_type_check
    CHECK (exception_type IN ('vacation','absence','holiday','special','partial'));

-- Ensure start < end when both are provided
ALTER TABLE schedule_exceptions
  DROP CONSTRAINT IF EXISTS schedule_exceptions_time_check;

ALTER TABLE schedule_exceptions
  ADD CONSTRAINT schedule_exceptions_time_check
    CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    );
