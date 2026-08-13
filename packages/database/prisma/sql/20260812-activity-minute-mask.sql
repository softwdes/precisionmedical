-- Tiempo de uso: de "contar pings" a "marcar minutos". 2026-08-12. Idempotente.
--
-- El modelo viejo hacía `activeMinutes = activeMinutes + 1` cada vez que llegaba
-- un ping, con una guarda de 50s para que dos pestañas no contaran doble. Tres
-- consecuencias, todas de subconteo (un empleado con 15 min reales veía 5-6):
--   · un ping perdido (red, timer atrasado, pestaña un segundo en background)
--     era un minuto perdido PARA SIEMPRE — no había forma de recuperarlo;
--   · el primer ping recién salía al minuto de montar, así que cada recarga de
--     página tiraba hasta 60s a la basura;
--   · subir la frecuencia de ping no ayudaba: la guarda de 50s los descartaba.
--
-- Ahora cada ping MARCA su minuto dentro de la hora en un bitmap de 60 bits.
-- La operación es OR, o sea idempotente: pingear diez veces el mismo minuto da
-- el mismo resultado que pingear una. Eso permite pingear cada 20s sin inflar
-- nada, hace innecesaria la guarda de tiempo (dos pestañas marcan el mismo bit)
-- y convierte un ping perdido en un problema de ese instante y no del minuto.
--
-- `activeMinutes` queda como columna derivada (popcount del bitmap) para no
-- tocar las tres consultas que ya la leen.

ALTER TABLE "user_activity" ADD COLUMN IF NOT EXISTS "minutesMask" BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN "user_activity"."minutesMask" IS
  'Bitmap de los 60 minutos de la hora con actividad. Bit N = minuto N. OR idempotente.';
COMMENT ON COLUMN "user_activity"."activeMinutes" IS
  'Derivada: popcount de minutesMask. Las filas anteriores al 2026-08-12 traen el conteo viejo (subestimado).';
