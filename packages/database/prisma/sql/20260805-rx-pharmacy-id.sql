-- =============================================================================
-- Prescription: pharmacyId + quantityQualifier
-- 2026-08-05
-- =============================================================================
-- Al repetir una receta el carrito quedaba sin farmacia y sin cantidad:
--  - ScriptSure resuelve la farmacia por su codigo NCPDP (ej "0000420"), no por
--    el nombre de texto que era lo unico que guardabamos.
--  - La cantidad viaja junto a su unidad (quantityQualifier) en su modelo.
-- Aditivo: 2 columnas nullable.
-- =============================================================================

ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "pharmacyId"        TEXT;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "quantityQualifier" TEXT;
