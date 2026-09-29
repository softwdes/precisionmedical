-- 20260928 — "MVA F/U": marcar que una fila NO es primera visita
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- La grilla de Edson toma la cita más vieja del caso y la trata como primera
-- visita. A veces no lo es: al mismo paciente se le abrió un caso nuevo y esa
-- "primera" cita es en realidad el control de la semana 4 de un tratamiento que
-- ya venía corriendo. Edson lo reconoce de un vistazo y hoy no tiene dónde
-- anotarlo.
--
-- ── Por qué NO se deduce, que era mi primera propuesta ──────────────────────
--
-- La vista YA intenta deducirlo (`VISITA_MVA_ANTERIOR`): busca otra cita MVA
-- del mismo paciente, del MISMO accidente, anterior a esta. Y encuentra CERO,
-- porque exige `cases.accidentDate` en los dos casos y **602 de 1.116 casos MVA
-- (54%) no la tienen cargada**.
--
-- Propuse alinear la regla con la del calendario —que sólo pregunta "¿vino
-- antes?"— y lo medí antes de hacerlo. De los 28 casos que el calendario marca
-- como recurrentes:
--
--     5  son OTRO accidente   → son admisiones NUEVAS, no controles
--     0  son el MISMO         → no hay un solo F/U detectable
--    23  no se puede saber    → falta la fecha en uno de los dos
--
-- O sea que deducirlo escondería 5 MVA nuevos de la cola de Edson y no acertaría
-- ninguno. Es exactamente el bug que la clínica reportó dos veces (Gattlin
-- Rogers el 2026-09-18, Karlee Sanchez el 22): "that day was her new MVA".
--
-- Los 23 indecidibles son la razón de fondo: **el sistema no puede saberlo**,
-- porque el dato que necesitaría está vacío en más de la mitad de los casos.
-- Cuando el sistema no puede, decide la persona. Mismo criterio que MVA vs GM.
--
-- ── Por qué es NULLABLE y no un booleano con default ────────────────────────
--
-- Tres estados, y los tres significan cosas distintas:
--
--   NULL   nadie dijo nada  → vale la pista (ver abajo)
--   true   Edson dice que es un control recurrente
--   false  Edson dice que SÍ es primera visita, aunque la pista diga lo contrario
--
-- Con un booleano NOT NULL DEFAULT false no se puede distinguir "no revisado"
-- de "revisado y es primera visita", y esa diferencia es justo la que hace que
-- una cola de trabajo sirva.
--
-- ── La pista, que no se guarda ──────────────────────────────────────────────
--
-- Recepción ya escribe "MVA F/U 2 WEEKS" en las notas de la cita: 761 de 3.985
-- citas MVA dicen F/U o "follow up". En 23 casos esa nota está en la cita que la
-- grilla muestra (6 dentro de la ventana de 90 días). Eso se lee al vuelo desde
-- `appointments.notes` y NO se copia acá: es un dato de recepción, vive donde lo
-- escribieron, y si lo corrigen la grilla se entera sola. Esta columna guarda
-- sólo lo que decide EDSON, que es lo único que no está escrito en ningún lado.
--
-- ── Alcance ─────────────────────────────────────────────────────────────────
--
-- `case_tracking` es la tabla propia de esta vista. No se toca `cases` ni
-- `appointments`: el tipo del caso (MVA/GM) es otra cosa y sigue donde está —
-- de él cuelgan el precio, el lien y la facturación, y "es un control" no es un
-- tipo de caso.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20260928-visita-recurrente.sql

BEGIN;

ALTER TABLE case_tracking
  ADD COLUMN IF NOT EXISTS "followUpOverride" BOOLEAN;

COMMENT ON COLUMN case_tracking."followUpOverride" IS
  'Edson dice si esta fila es un control recurrente (true) o primera visita (false). NULL = no revisado, vale la pista de appointments.notes. No se deduce: 54% de los casos MVA no tienen accidentDate y sin eso no se puede distinguir un control de un accidente nuevo.';

-- Índice parcial: sólo las filas marcadas. Hoy serían 0 de 1.116, así que un
-- índice completo sería casi todo NULL y no lo usaría nadie.
CREATE INDEX IF NOT EXISTS case_tracking_follow_up_override_idx
  ON case_tracking ("followUpOverride")
  WHERE "followUpOverride" IS NOT NULL;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'case_tracking' AND column_name = 'followUpOverride';
--
-- Debe devolver: followUpOverride | boolean | YES
