-- =============================================================================
-- RxStatus: nuevo valor ERROR
-- 2026-08-05
-- =============================================================================
-- La primera receta real enviada por Devin volvió de ScriptSure con
-- `Prescription.messageStatus = "Error"` (no llegó a la farmacia), pero nuestra
-- UI la mostraba como "Enviada a farmacia": el mapeo leía el estado en el nivel
-- superior del payload y ScriptSure lo trae anidado.
--
-- ERROR es distinto de VOIDED. VOIDED es una anulación deliberada; ERROR es un
-- envío que falló y el doctor tiene que reintentar. Colapsarlos perdería esa
-- diferencia, que es justo la que le importa a quien atiende.
--
-- Aditivo: solo agrega un valor al enum. No toca datos ni tablas.
-- =============================================================================

ALTER TYPE "RxStatus" ADD VALUE IF NOT EXISTS 'ERROR';
