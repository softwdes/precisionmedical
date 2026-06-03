-- ============================================================
-- Freelancer Payments — Lifecycle (PENDING/PAID/CANCELLED/REVERSED)
-- + bankQrUrl + bonus + CONTRATISTA modalidad fix
-- Run in Supabase SQL Editor
-- ============================================================

BEGIN;

-- ─── 1. Add CONTRATISTA to modalidad CHECK (was missing from SQL) ───
ALTER TABLE freelancers DROP CONSTRAINT IF EXISTS freelancers_modalidad_check;
ALTER TABLE freelancers ADD CONSTRAINT freelancers_modalidad_check
  CHECK (modalidad IN ('POR_HORA', 'POR_SERVICIO', 'CONTRATISTA'));

ALTER TABLE freelancer_payments DROP CONSTRAINT IF EXISTS freelancer_payments_modalidad_check;
ALTER TABLE freelancer_payments ADD CONSTRAINT freelancer_payments_modalidad_check
  CHECK (modalidad IN ('POR_HORA', 'POR_SERVICIO', 'CONTRATISTA'));

-- ─── 2. Add bankQrUrl to freelancers (for QR scan flow at payment) ───
ALTER TABLE freelancers
  ADD COLUMN IF NOT EXISTS "bankQrUrl" TEXT;

-- ─── 3. Add lifecycle columns to freelancer_payments ───
ALTER TABLE freelancer_payments
  ADD COLUMN IF NOT EXISTS status          TEXT          NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PAID','CANCELLED','REVERSED')),
  ADD COLUMN IF NOT EXISTS "scheduledDate" DATE,
  ADD COLUMN IF NOT EXISTS "bonusAmount"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "bonusReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "reversedById"  UUID,
  ADD COLUMN IF NOT EXISTS "paidDate"      DATE;

-- ─── 4. Make fechaPago nullable (PENDING rows have no paid date yet) ───
ALTER TABLE freelancer_payments
  ALTER COLUMN "fechaPago" DROP NOT NULL;

-- ─── 5. Backfill: existing rows are historical PAID records ───
UPDATE freelancer_payments
  SET status = 'PAID',
      "paidDate" = "fechaPago"
  WHERE status = 'PENDING'    -- only newly-defaulted rows
    AND "fechaPago" IS NOT NULL;

-- ─── 6. FK for append-only reversal pair ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fp_reversed_by_fkey'
  ) THEN
    ALTER TABLE freelancer_payments
      ADD CONSTRAINT fp_reversed_by_fkey
      FOREIGN KEY ("reversedById") REFERENCES freelancer_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 7. Indexes for the new "pagos pendientes" queries ───
CREATE INDEX IF NOT EXISTS idx_fp_status         ON freelancer_payments(status);
CREATE INDEX IF NOT EXISTS idx_fp_scheduled_date ON freelancer_payments("scheduledDate");
CREATE INDEX IF NOT EXISTS idx_fp_status_sched   ON freelancer_payments(status, "scheduledDate");

COMMIT;

-- ─── Verification queries (run separately to confirm) ───
-- SELECT status, COUNT(*) FROM freelancer_payments GROUP BY status;
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'freelancer_payments' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'bankQrUrl';
