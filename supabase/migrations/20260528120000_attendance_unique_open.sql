-- =============================================================
-- Attendance: partial UNIQUE index over OPEN shifts
-- =============================================================
-- Prevents two attendance records WITHOUT check_out for the same
-- employee on the same day. Allows multiple shifts per day as long
-- as the previous one is closed (e.g. split shifts, admin
-- corrections, re-opening after an early clock-out by mistake).
--
-- Closes the duplicate-clock-in race condition where the app could
-- crash between INSERT and setState, letting the user trigger a
-- second INSERT on reload.
--
-- Client-side: apps/timeclock/components/ClockPage.tsx — handleClockIn
-- catches Postgres error 23505 on this index and surfaces a clear
-- "ya tienes un turno abierto" message instead of the generic one.
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_attendance
  ON public.attendance_records (employee_id, date)
  WHERE check_out IS NULL;
