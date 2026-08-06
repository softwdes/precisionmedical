-- =============================================================================
-- Hora de salida del paciente
-- 2026-08-06
-- =============================================================================
-- El "tiempo en clínica" del Resumen se calculaba desde `checkedInAt` hasta
-- AHORA cuando la visita no tenía `doctorDoneAt`. Como el checkout solo ponía
-- `status = COMPLETED` sin sellar hora, el contador seguía corriendo para
-- siempre: en producción se veían visitas con "31 h 35 min" y "53 h 35 min" en
-- clínica. Un número así no solo es falso — entrena al staff a ignorar el campo.
--
-- `checkedOutAt` cierra el reloj cuando el asistente cierra la visita. Sirve
-- además para medir duración real de visita en estadísticas, que hoy no se puede.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE "appointments"
    ADD COLUMN IF NOT EXISTS "checkedOutAt" TIMESTAMP(3);

-- Backfill deliberadamente NO se hace: no existe el dato histórico de cuándo
-- salió cada paciente y no se puede inventar. Las visitas viejas quedan sin hora
-- de salida y el Resumen las muestra como "sin cerrar", que es la verdad.
