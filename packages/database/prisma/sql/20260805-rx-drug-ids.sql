-- =============================================================================
-- Prescription: identificadores del medicamento de ScriptSure
-- 2026-08-05
-- =============================================================================
-- Para poder REPETIR una receta desde el historial. El carrito de ScriptSure
-- (MedCart) identifica el fármaco por ROUTED_MED_ID + GCN_SEQNO, no por nombre;
-- sin guardarlos, "repetir" obligaría al doctor a buscar el medicamento a mano
-- otra vez, que es justo lo que se quiere evitar.
--
-- Confirmados presentes en el payload real del 2026-08-05:
--   Ndc 63981032978 · RxNorm 1049630 · drugId 196821
--   GCN_SEQNO 11594 · ROUTED_MED_ID 16589
--
-- Aditivo: 5 columnas nullable. No toca datos existentes.
-- =============================================================================

ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "ndc"              TEXT;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "rxNorm"           TEXT;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "routedMedId"      TEXT;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "gcnSeqno"         TEXT;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "scriptsureDrugId" TEXT;
