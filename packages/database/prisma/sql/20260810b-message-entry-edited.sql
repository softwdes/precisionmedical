-- =============================================================================
-- Mensajería: marca de edición en las entradas del hilo
-- 2026-08-10
-- =============================================================================
-- El autor puede corregir su propio mensaje mientras NADIE MÁS lo haya leído.
-- La condición es la lectura, no un reloj: editar algo que otro ya leyó (y pudo
-- haber ejecutado) es reescribir el registro a espaldas de quien actuó.
--
-- Columna nueva ANULABLE: es compatible hacia atrás, el código desplegado que
-- no la conoce simplemente no la selecciona. Distinto del valor de enum que
-- agregamos hoy más temprano — ese SÍ lo leía el cliente viejo y rompía. Con
-- base compartida: valores de enum después del deploy, columnas anulables antes.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE "message_entries"
    ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
