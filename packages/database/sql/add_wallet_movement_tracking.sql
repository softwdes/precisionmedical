-- Add movement tracking and active flag to wallets table
-- Run in Supabase SQL editor
-- Prepared for Phase 2 FX connection

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS last_movement_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index to speed up queries filtering active wallets
CREATE INDEX IF NOT EXISTS idx_wallets_is_active ON wallets (is_active);
