-- 20260928b — la bandeja de SMS entrantes
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Hoy NO existe ninguna ruta que reciba un SMS entrante. En `app/api` está
-- `twilio/sms-status` (acuses de entrega) y `twilio/incoming`, que es de VOZ.
-- Cuando un paciente responde un mensaje nuestro, Twilio lo recibe y —sin
-- webhook configurado— lo descarta. No queda en ningún lado.
--
-- Por eso nuestros SMS dicen "no responda": no es cortesía, es que no hay
-- bandeja detrás. Si alguien contestó "no puedo el martes", nadie lo vio nunca.
--
-- Pedido de Erick (2026-09-28) después de que la clínica pidiera una vista de
-- conversación por paciente, al estilo Weave. Sin esto esa vista sería un
-- monólogo: 350 mensajes en la tabla y los 350 los mandamos nosotros.
--
-- ── Por qué el default ES el backfill ───────────────────────────────────────
--
-- `direction` entra con DEFAULT 'OUTBOUND' y eso ya deja bien las 350 filas que
-- existen: todas son salientes, porque hasta hoy no había otra forma de que
-- entrara una. No hay UPDATE que correr ni riesgo de marcar mal una fila
-- vieja — el día que exista una entrante será porque la escribió el webhook
-- nuevo, que la marca explícitamente.
--
-- ── Por qué `readAt` va acá y no en una tabla aparte ────────────────────────
--
-- "Sin leer" es un atributo del mensaje, no una entidad. Una tabla de lecturas
-- tendría sentido si importara QUIÉN de cinco personas lo leyó primero y hubiera
-- que mostrarlo por persona; acá la pregunta que hace la bandeja es una sola —
-- "¿alguien se ocupó de esto?"— y la contesta una fecha. `readByUserId` queda
-- al lado para poder responder "¿quién?" sin una tabla más.
--
-- Solo aplica a los ENTRANTES. Un mensaje que mandamos nosotros no se "lee", así
-- que en los salientes se queda en NULL para siempre y no significa nada. El
-- índice lleva `direction` adelante justo por eso.
--
-- ── Los dos índices ─────────────────────────────────────────────────────────
--
-- La bandeja hace exactamente dos preguntas y cada una tiene el suyo:
--   (direction, readAt)      → el badge: entrantes sin abrir
--   (patientId, createdAt)   → el hilo: todo lo de este paciente, en orden
--
-- Sin ellos las dos son un scan completo. Hoy son 350 filas y no se nota; con la
-- bandeja encendida esta tabla crece con cada mensaje que entra y con cada uno
-- que sale, y el badge se consulta en cada carga de pantalla.
--
-- No hace falta GRANT: `message_logs` ya existe y ya los tiene. Los GRANT se
-- pierden al CREAR una tabla a mano, no al agregarle columnas.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20260928b-sms-entrante.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageDirection') THEN
    CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');
  END IF;
END
$$;

ALTER TABLE message_logs
  ADD COLUMN IF NOT EXISTS direction "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readByUserId" TEXT;

COMMENT ON COLUMN message_logs.direction IS
  'Quien escribio. OUTBOUND = lo mandamos nosotros (el default, y el backfill correcto: hasta 2026-09-28 no habia forma de recibir). INBOUND lo escribe api/twilio/sms-incoming.';

COMMENT ON COLUMN message_logs."readAt" IS
  'Cuando el staff abrio un mensaje ENTRANTE. NULL en un entrante = sin leer, y eso cuenta el badge. En un saliente no significa nada: un mensaje que mandamos nosotros no se lee.';

CREATE INDEX IF NOT EXISTS "message_logs_direction_readAt_idx"
  ON message_logs (direction, "readAt");

CREATE INDEX IF NOT EXISTS "message_logs_patientId_createdAt_idx"
  ON message_logs ("patientId", "createdAt");

COMMIT;
