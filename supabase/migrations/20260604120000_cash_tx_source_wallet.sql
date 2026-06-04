-- =============================================================
-- Caja Chica ↔ Wallet (Fase 4): origen de financiamiento opcional
-- =============================================================
-- Un DEPÓSITO a una caja chica puede financiarse desde una cartera
-- (wallet). Cuando se indica `sourceWalletId`, ese monto cuenta como
-- una SALIDA de esa wallet, en su misma moneda (sin conversión).
--
--   - sourceWalletId = NULL (default) → el depósito no afecta ninguna
--     wallet. Compatible con todos los depósitos históricos, que no
--     tienen origen registrado.
--   - sourceWalletId = <wallet> → el depósito descuenta de esa cartera.
--     Al revertir el depósito, el registro de reversal hereda el mismo
--     sourceWalletId (con monto negativo), de modo que el efecto sobre
--     la wallet se anula automáticamente.
-- =============================================================

ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS "sourceWalletId" text;

-- FK suave hacia wallets: ON DELETE SET NULL para no bloquear el borrado
-- de una wallet sin transacciones; el histórico de caja se conserva.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_transactions_sourceWalletId_fkey'
  ) THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT "cash_transactions_sourceWalletId_fkey"
      FOREIGN KEY ("sourceWalletId") REFERENCES public.wallets(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_source_wallet
  ON public.cash_transactions("sourceWalletId")
  WHERE "sourceWalletId" IS NOT NULL;
-- Índice parcial: solo indexa los depósitos financiados desde una wallet
-- (la gran mayoría tendrá sourceWalletId NULL).
