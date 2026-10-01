-- 20261001 — Seguimiento de no-shows: ¿lo llamamos? ¿volvió a agendar?
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Beatriz llevaba en un Excel el listado de pacientes que faltaron, en orden
-- cronológico, anotando si se los contactó después de la visita perdida y si
-- volvieron a agendar. Eso hoy no vive en ningún lado del sistema.
--
-- La mitad ya existe: la sección "Penalties not charged from earlier days" de
-- Day Admission ES esa lista cronológica. Lo que falta son las dos columnas de
-- seguimiento.
--
-- ── Qué se guarda y qué NO ──────────────────────────────────────────────────
--
-- Sólo el CONTACTO. Lo demás se calcula:
--
--   · "¿Volvió a agendar?" NO se guarda. Se mira si el paciente tiene una cita
--     posterior, que es un dato que ya está. Medido el 2026-10-01: de 94
--     desenlaces fallidos, 56 ya tienen cita posterior. Guardarlo sería copiar
--     un dato que se desincroniza en cuanto alguien reprograma.
--
--   · "¿Lo contactamos?" SÍ se guarda, porque no hay de dónde deducirlo. Fui a
--     buscarlo antes de agregar la columna:
--         call_logs    → 0 filas. El marcador existe y nadie registra llamadas.
--         message_logs → 450 filas, pero sólo 12 de los 94 recibieron algo.
--     Deducirlo diría "no contactado" en 82 de 94 casos aunque Beatriz los haya
--     llamado a todos. Peor que no tenerlo.
--
-- ── Por qué en `appointments` y no en `case_tracking` ───────────────────────
--
-- El seguimiento es de LA VISITA QUE SE PERDIÓ, no del caso. Un paciente con
-- tres no-shows necesita tres anotaciones, no una. En `case_tracking` sólo
-- entraría la última y se perdería el historial, que es justo lo que el Excel
-- guardaba.
--
-- ── Alcance ─────────────────────────────────────────────────────────────────
--
-- Cuatro columnas, todas nulables. Ninguna fila existente cambia: un NULL en
-- `followUpContactedAt` significa "nadie lo marcó todavía", que es el estado
-- correcto para las 94 que ya están.
--
-- Se empieza con lo mínimo a propósito. Beatriz lo va a usar y va a decir si
-- necesita distinguir "llamé y no atendió" de "hablé con el paciente" — eso
-- sería un estado más, y se agrega cuando ella lo pida, no antes.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20261001-seguimiento-de-no-shows.sql

BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS "followUpContactedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "followUpContactedById"   TEXT,
  -- Denormalizado, mismo criterio que `completedByName` en case_tracking: la
  -- lista muestra "Beatriz T." sin join a users en cada fila.
  ADD COLUMN IF NOT EXISTS "followUpContactedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "followUpNote"            TEXT;

COMMENT ON COLUMN appointments."followUpContactedAt" IS
  'Cuándo se contactó al paciente DESPUÉS de faltar a esta visita. NULL = nadie lo marcó. No se deduce: call_logs está vacío y solo 12 de 94 no-shows recibieron un mensaje.';
COMMENT ON COLUMN appointments."followUpNote" IS
  'Qué dijo el paciente cuando se lo contactó. Es la celda de texto que Beatriz llenaba en el Excel.';

-- Índice parcial: sólo las contactadas. Hoy serían 0 de 8.500 citas, así que un
-- índice completo sería casi todo NULL y no lo usaría nadie.
CREATE INDEX IF NOT EXISTS appointments_follow_up_contacted_idx
  ON appointments ("followUpContactedAt")
  WHERE "followUpContactedAt" IS NOT NULL;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'appointments' AND column_name LIKE 'followUp%'
--  ORDER BY column_name;
--
-- Debe devolver 4 filas, las cuatro con is_nullable = YES.
