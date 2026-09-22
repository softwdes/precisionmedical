-- 20260921e — Queda copia de lo que se firmó, cada vez
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Devin pidió poder REABRIR una nota firmada durante 48 horas para corregirla,
-- y un addendum después de esa ventana. Antes de poder construir eso hay que
-- tapar un agujero que ya existe:
--
--   **Hoy no queda copia de lo que se firmó.** El PUT de la nota audita
--   `CREATE_VISIT_NOTE` y `TAKEOVER_VISIT_NOTE` — nunca el contenido. El
--   `/sign` audita metadata (cita, paciente, firmante, fecha) SIN el texto. En
--   `audit_logs` de `visit_notes` hay 20 TAKEOVER y 3 CREATE, y cero firmas con
--   cuerpo.
--
-- Si se agregara el botón de reabrir sobre esto, editar SOBREESCRIBIRÍA el
-- texto firmado sin dejar rastro de que alguna vez dijo otra cosa. Esa es
-- exactamente la versión que reprueba una auditoría: la regla (CMS, Program
-- Integrity Manual 3.3.2.5) pide que una enmienda **se identifique como tal,
-- lleve fecha y autor, y no borre ni tape el original**.
--
-- Por eso el orden es: primero la versión, después la reapertura.
--
-- ── Qué crea ────────────────────────────────────────────────────────────────
--
-- 1. `visit_note_versions` — una fila POR FIRMA. La versión 1 es la primera
--    firma; al reabrir y volver a firmar se escribe la 2, y así. Entre medio no
--    se guarda nada: mientras la nota está reabierta, la última versión firmada
--    sigue siendo la 1, que es justo lo que hay que poder mostrar.
--
--    Lleva las seis secciones SOAP Y los diagnósticos. Los diagnósticos viven
--    en otra tabla y también cambian; sin ellos la "copia de lo firmado" sería
--    media copia. Van como JSON porque es una FOTO, no una relación: si mañana
--    se borra un diagnóstico del catálogo, la foto no se puede mover.
--
-- 2. `visit_notes.reopenedAt` / `reopenedById` / `reopenedByName` — la nota
--    reabierta.
--
--    ⚠️ La nota reabierta **NO vuelve a DRAFT**, se queda en SIGNED. Hay 25
--    lugares que preguntan `status === 'SIGNED'` —la lista de Facturación, el
--    HCFA, el seguimiento de Edson, el portal del bufete, la impresión—, y
--    devolverla a borrador la haría DESAPARECER de la lista de Facturación en
--    mitad del ciclo de cobro. Erick, 2026-09-21: Finanzas sigue cobrando meses
--    después; nada del dinero se cuelga de la firma.
--
--    Lo que habilita la edición es `reopenedAt`, no el estado. Son dos guards
--    en dos archivos, contra veinticinco lecturas que no se tocan.
--
-- 3. Relleno: la nota que HOY está firmada recibe su versión 1, para que no
--    quede una firma sin copia.
--
-- ── Cómo se aplica ──────────────────────────────────────────────────────────
--
--   node scripts/apply-sql.cjs prisma/sql/20260921e-versiones-de-la-nota.sql
--
-- Idempotente: se puede correr dos veces sin romper nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · La tabla de versiones
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visit_note_versions (
  -- `id` con DEFAULT a propósito: el resto de las tablas se aplicó con `db push`
  -- y quedaron SIN default, así que todo insert que no traiga id muere. Acá el
  -- relleno de más abajo inserta sin id y tiene que funcionar.
  id              text        NOT NULL DEFAULT gen_random_uuid()::text,
  "visitNoteId"   text        NOT NULL,
  version         integer     NOT NULL,

  -- Las seis secciones, tal cual se firmaron.
  "chiefComplaint" text,
  hpi              text,
  ros              text,
  "physicalExam"   text,
  assessment       text,
  plan             text,

  -- Foto de los diagnósticos: [{icd10Code, icd10Label, snomedCode, snomedLabel}]
  diagnoses       jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Quién firmó ESTA versión y cuándo. Se copia de la nota al firmar: son
  -- snapshots, no referencias — el nombre tiene que sobrevivir a que la persona
  -- cambie de apellido o deje la clínica.
  "signedAt"      timestamp(3) NOT NULL,
  "signedById"    text,
  "signedByName"  text,

  -- 'FIRMA_INICIAL' | 'REFIRMA'. Sirve para leer el historial de un vistazo sin
  -- tener que deducirlo del número de versión.
  motivo          text        NOT NULL DEFAULT 'FIRMA_INICIAL',

  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT visit_note_versions_pkey PRIMARY KEY (id)
);

-- Una sola fila por (nota, versión). Es lo que hace que correr esto dos veces,
-- o que dos firmas simultáneas se pisen, no pueda duplicar una versión.
CREATE UNIQUE INDEX IF NOT EXISTS visit_note_versions_nota_version_key
  ON visit_note_versions ("visitNoteId", version);

CREATE INDEX IF NOT EXISTS visit_note_versions_nota_idx
  ON visit_note_versions ("visitNoteId");

-- El FK va aparte y con guarda: `ADD CONSTRAINT` no acepta IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visit_note_versions_visitNoteId_fkey'
  ) THEN
    ALTER TABLE visit_note_versions
      ADD CONSTRAINT "visit_note_versions_visitNoteId_fkey"
      FOREIGN KEY ("visitNoteId") REFERENCES visit_notes(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · La nota reabierta
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "reopenedAt"     timestamp(3);
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "reopenedById"   text;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "reopenedByName" text;

COMMENT ON COLUMN visit_notes."reopenedAt" IS
  'Nota firmada reabierta para corregir. Mientras no sea NULL se puede editar aunque el status siga en SIGNED. Se limpia al volver a firmar, que escribe una versión nueva.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Relleno: las firmas que ya existen se quedan sin copia si no hacemos esto
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO visit_note_versions (
  "visitNoteId", version,
  "chiefComplaint", hpi, ros, "physicalExam", assessment, plan,
  diagnoses, "signedAt", "signedById", "signedByName", motivo
)
SELECT
  n.id, 1,
  n."chiefComplaint", n.hpi, n.ros, n."physicalExam", n.assessment, n.plan,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'icd10Code',  d."icd10Code",
             'icd10Label', d."icd10Label",
             'snomedCode', d."snomedCode",
             'snomedLabel',d."snomedLabel"
           ) ORDER BY d."sortOrder")
    FROM visit_note_diagnoses d WHERE d."noteId" = n.id
  ), '[]'::jsonb),
  -- Hay firmas viejas sin `signedAt` (migradas). Se usa `updatedAt` antes que
  -- dejar la copia afuera: la fecha aproximada es peor que nada, pero perder la
  -- única copia de una nota firmada es mucho peor.
  COALESCE(n."signedAt", n."updatedAt"),
  n."signedById", n."signedByName",
  'FIRMA_INICIAL'
FROM visit_notes n
WHERE n.status = 'SIGNED'
  AND NOT EXISTS (
    SELECT 1 FROM visit_note_versions v WHERE v."visitNoteId" = n.id
  );
