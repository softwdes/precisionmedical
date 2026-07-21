-- Migration: add missing TriageRecord columns (2026-07-21)
-- Run this in Supabase SQL editor or psql
-- Safe: only ADD COLUMN (no drops, no data loss)

ALTER TABLE "triage_records"
  ADD COLUMN IF NOT EXISTS "diastolicMmhg2"   INTEGER,
  ADD COLUMN IF NOT EXISTS "o2Comment"         TEXT,
  ADD COLUMN IF NOT EXISTS "painScale"         INTEGER,
  ADD COLUMN IF NOT EXISTS "pulseBpm2"         INTEGER,
  ADD COLUMN IF NOT EXISTS "respiratoryRate"   INTEGER,
  ADD COLUMN IF NOT EXISTS "respiratoryRate2"  INTEGER,
  ADD COLUMN IF NOT EXISTS "systolicMmhg2"     INTEGER,
  ADD COLUMN IF NOT EXISTS "tempCelsius2"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tempFahrenheit2"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "visualAcuityRight" TEXT,
  ADD COLUMN IF NOT EXISTS "visualAcuityLeft"  TEXT,
  ADD COLUMN IF NOT EXISTS "visualAcuityBoth"  TEXT,
  ADD COLUMN IF NOT EXISTS "visionCorrected"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "chiefComplaint"    TEXT;
