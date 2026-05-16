-- Add bonus support columns to payments table
-- Run in Supabase SQL editor or as a migration

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS base_salary decimal,
  ADD COLUMN IF NOT EXISTS bonus_amount decimal,
  ADD COLUMN IF NOT EXISTS bonus_reason text;

-- Backfill: existing records get base_salary = amountLocal
UPDATE payments
SET base_salary = "amountLocal"
WHERE base_salary IS NULL;
