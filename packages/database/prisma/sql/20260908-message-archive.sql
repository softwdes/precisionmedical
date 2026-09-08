-- =============================================================================
-- Bandeja del portal legal tipo Gmail — carpeta "Archivados" · 2026-09-08 · PHOENIX
-- =============================================================================
-- Cada participante puede archivar un hilo para sí. Es una columna en la fila
-- del participante, no en el hilo: archivar es personal, y distinto de borrar
-- (`deletedAt`): lo archivado vuelve solo cuando alguien escribe en el hilo.
-- Idempotente.
-- =============================================================================

ALTER TABLE "message_recipients" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp(3);

NOTIFY pgrst, 'reload schema';
