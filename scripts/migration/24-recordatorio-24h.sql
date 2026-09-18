-- Recordatorio de cita 24 h antes, por correo (Erick, 2026-09-18).
--
-- Una sola columna: cuándo el cron PROCESÓ esta cita para el recordatorio.
-- Marca el intento, no la entrega — si el correo salió o no vive en
-- `message_logs`. Acá solo se responde "ya me ocupé de ésta", que es lo que
-- evita el correo repetido cuando el cron se dispara dos veces (los de Vercel
-- corren en UTC y el horario de verano hace que una hora pase dos veces al año).
--
-- ⚠️ ORDEN: esto va ANTES del deploy que trae el cron. Si el código sale
-- primero, la columna no existe y el cron falla en cada corrida. El resto de la
-- app no la toca, así que un desfasaje NO rompe nada más que el recordatorio.
--
-- Se aplica con `node scripts/apply-sql.cjs scripts/migration/24-recordatorio-24h.sql`.
-- NO usar `prisma db push`: el schema tiene deriva y arrastraría DROP CONSTRAINT
-- de tablas ajenas.

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "recordatorio24hAt" TIMESTAMP(3);

-- El cron busca las citas de la próxima hora que todavía no se procesaron.
-- Sin índice, eso es un scan de `appointments` (14k filas y creciendo) cada
-- hora. Parcial sobre las no procesadas, que son las únicas que se consultan.
CREATE INDEX IF NOT EXISTS "appointments_recordatorio24h_pendientes_idx"
  ON "appointments" ("scheduledFor")
  WHERE "recordatorio24hAt" IS NULL;
