-- =============================================================
-- Realtime: enable full row replication for attendance tables
-- =============================================================
-- Symptom: when an employee makes Break / Return / Clock Out
-- (UPDATEs), the Realtime channel filter "employee_id=eq.X" or
-- "date=eq.Y" fails to match because by default Postgres only
-- ships the primary key + changed columns in UPDATE/DELETE
-- replication payloads. Those filter columns aren't in the
-- payload -> the filter evaluates to false -> the broadcast
-- never reaches subscribed clients.
--
-- INSERTs were unaffected (full row is always shipped on INSERT),
-- which is why the initial clock-in showed up correctly but
-- subsequent state changes didn't.
--
-- Fix: REPLICA IDENTITY FULL tells Postgres to include every
-- column in every UPDATE/DELETE WAL message. Cost is negligible
-- for these tables (small rows, low write rate).
-- =============================================================

ALTER TABLE public.attendance_records   REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_waypoints REPLICA IDENTITY FULL;
