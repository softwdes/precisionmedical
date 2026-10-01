-- 20261001 — avisar que otra persona esta atendiendo la misma conversacion
--
-- ── Que resuelve ────────────────────────────────────────────────────────────
--
-- Con la bandeja de SMS en uso real, dos personas de recepcion pueden abrir el
-- mismo mensaje de un paciente y contestarle las dos. El paciente recibe dos
-- respuestas, a veces distintas.
--
-- Pedido de Erick (2026-10-01): **avisar, no bloquear**. Un candado convierte un
-- aviso util en una pelea por el candado —quien lo tiene, que pasa si cierra la
-- pestaña, como se libera— y el caso comun (dos miran, una contesta) no necesita
-- exclusion. Alcanza con que la segunda persona vea que no esta sola.
--
-- ── Por que el TTL es CORTO, al reves que el de las llamadas ────────────────
--
-- `call_agent_presence` tolera 150 s sin latido: ahi un latido perdido sacaria a
-- alguien del grupo de timbrado, y eso es peor que una fila un poco vieja.
--
-- Aca es al reves. Una fila vieja dice "Pamela esta viendo esto" cuando Pamela
-- cerro la pestaña hace dos minutos, y la otra persona espera contra nadie. El
-- aviso falso es peor que la ausencia de aviso, asi que el latido va cada 20 s y
-- la fila vale 45 s. Los dos numeros viven en `lib/presencia-sms.ts`.
--
-- ── Por que no hay proceso de limpieza ─────────────────────────────────────
--
-- La lectura filtra por `lastSeenAt`, asi que una fila vencida no se muestra
-- aunque siga ahi. Y la clave es (conversacion, usuario): las filas no crecen
-- con el tiempo, crecen con la cantidad de pares distintos, que esta acotada por
-- el staff. El DELETE del final de cada latido limpia lo propio.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20261001-presencia-sms.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sms_conversation_presence (
  clave        TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "userName"   TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clave, "userId")
);

CREATE INDEX IF NOT EXISTS "sms_conversation_presence_clave_lastSeenAt_idx"
  ON sms_conversation_presence (clave, "lastSeenAt");

COMMENT ON TABLE sms_conversation_presence IS
  'Quien esta mirando una conversacion de SMS ahora. Avisa, no bloquea. Fila vencida (>45s sin latido) no se muestra: ver lib/presencia-sms.ts.';

-- ⚠️ Los GRANT se pierden al crear una tabla a mano: sin esto anda por Prisma y
-- falla por REST con 42501. Ya paso tres veces en esta base.
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_conversation_presence TO service_role;
GRANT SELECT ON sms_conversation_presence TO authenticated;

COMMIT;
