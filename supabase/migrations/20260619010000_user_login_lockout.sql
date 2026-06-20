-- Migration: user login lockout fields
-- Adds failed-attempt counter + lockout timestamp to users table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil"         timestamptz,
  ADD COLUMN IF NOT EXISTS "lastFailedAttemptAt" timestamptz;

CREATE INDEX IF NOT EXISTS users_locked_until_idx ON users ("lockedUntil")
  WHERE "lockedUntil" IS NOT NULL;
