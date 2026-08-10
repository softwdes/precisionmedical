-- =============================================================================
-- Mensajería: el autor también participa del hilo
-- 2026-08-10
-- =============================================================================
-- Reporte de los usuarios en pruebas: "el que envía el mensaje no lo ve en su
-- lista". Era real — solo se creaban filas de participante para To/CC, así que
-- el hilo no aparecía en la bandeja del autor. Peor: si alguien le respondía,
-- la respuesta lo agregaba como destinatario y el hilo aparecía de golpe.
--
-- En el EMR legacy esa lista incluye los mensajes propios (el inbox es "los
-- hilos en los que participo"). Se agrega el tipo SENDER para el autor, con
-- `lastReadAt` sellado: aparece en su bandeja pero SIN negrita, y se vuelve a
-- marcar cuando alguien responde o agrega una nota.
--
-- Idempotente: se puede correr dos veces.
-- =============================================================================

ALTER TYPE "message_recipient_kind" ADD VALUE IF NOT EXISTS 'SENDER';
