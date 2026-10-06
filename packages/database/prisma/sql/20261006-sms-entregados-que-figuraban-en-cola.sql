-- 20261006 — los SMS que llegaron pero figuraban "en cola"
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- Twilio avisa el estado de un SMS con tres POST sueltos —`queued`, `sent`,
-- `delivered`— y NO garantiza el orden. `api/twilio/sms-status` aplicaba el
-- último que llegara, así que cuando el `queued` entraba tarde le pisaba el
-- `delivered` que ya estaba guardado.
--
-- Medido el 2026-10-06: **81 de 466 salientes**, uno de cada seis, con estado
-- QUEUED y `deliveredAt` puesto al mismo tiempo. En la pantalla se leía como
-- "no salió"; en la consola de Twilio decían entregados. El registro
-- contradecía al proveedor, y el mostrador le creía al registro.
--
-- La prueba de que fue una carrera está en los tiempos: en los entregados, la
-- última escritura cae 0,00 s después del acuse; en los 81 atascados cae
-- 0,35 s DESPUÉS. Algo escribió luego del "entregado".
--
-- El código ya quedó arreglado con un guardia de orden (el estado solo avanza).
-- Esto repara las filas que se escribieron mal antes del arreglo.
--
-- ── Por qué se puede afirmar que SÍ llegaron ───────────────────────────────
--
-- Porque `deliveredAt` no se escribe nunca "por las dudas". En el código hay
-- exactamente tres lugares que lo ponen:
--   · `twilio/sms-status`  → solo cuando el estado mapeado es DELIVERED
--   · `twilio/email-status`→ solo en eventos `delivered`, y de canal EMAIL
--   · `twilio/sms-incoming`→ en los ENTRANTES, que acá quedan excluidos
-- Así que en un SALIENTE de SMS, tener `deliveredAt` es la firma del acuse de
-- entrega de Twilio. No se está adivinando: se está restaurando un dato que ya
-- había llegado y que un aviso atrasado tapó.
--
-- Se excluyen por las dudas las filas con `errorCode`: si Twilio reportó un
-- error, el caso merece mirarse a mano y no un UPDATE masivo.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20261006-sms-entregados-que-figuraban-en-cola.sql

BEGIN;

UPDATE message_logs
   SET status = 'DELIVERED'
 WHERE channel     = 'SMS'
   AND direction   = 'OUTBOUND'
   AND status      IN ('QUEUED', 'SENT')
   AND "deliveredAt" IS NOT NULL
   AND "errorCode"   IS NULL;

COMMIT;
