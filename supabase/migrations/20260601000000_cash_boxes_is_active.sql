-- =============================================================
-- Cash boxes: add is_active column for soft-deactivation
-- =============================================================
-- Cash boxes can be in 3 states:
--   - is_active = true (default) → operational, visible in dropdowns,
--     receives transactions, triggers low-balance alerts.
--   - is_active = false → soft-deactivated. Hidden from dropdowns
--     and alerts but historical transactions remain queryable for
--     audit. Used when a box is retired but had real activity.
--   - Hard DELETE → only allowed when the box has 0 transactions
--     (handled at the API layer, no DB constraint).
-- =============================================================

ALTER TABLE public.cash_boxes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- All existing rows default to active — safe migration, no rows
-- become "inactive" silently.

CREATE INDEX IF NOT EXISTS idx_cash_boxes_is_active
  ON public.cash_boxes(is_active)
  WHERE is_active = true;
-- Partial index: only indexes active rows since 99% of queries filter
-- WHERE is_active = true. Cheaper than a full index.
