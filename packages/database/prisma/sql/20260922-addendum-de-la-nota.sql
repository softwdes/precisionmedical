-- 20260922 — El addendum: corregir una nota cuando ya no se puede reabrir
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Devin, 2026-09-21: *"Add Addendum section that can be added in after that 48
-- hour window which is timestamped."*
--
-- La reapertura (20260921e) cubre las primeras 48 horas: se corrige el cuerpo y
-- se vuelve a firmar, y cada firma deja su copia. Pasada esa ventana el cuerpo
-- NO se toca más — y ahí entra esto: un bloque nuevo, con su fecha y su firma,
-- que se agrega al pie sin mover una coma de lo firmado.
--
-- Es el mecanismo estándar de enmienda y es lo que pide la regla (CMS PIM
-- 3.3.2.5): la corrección se identifica como tal, lleva fecha y autor, y no
-- borra ni tapa el original. Acá el original queda literalmente intacto.
--
-- ── Una decisión que conviene saber ─────────────────────────────────────────
--
-- El addendum **no se bloquea dentro de las 48 horas**. Devin lo describió como
-- "lo de después", pero prohibirlo antes sería inventar una traba: si el
-- provider prefiere dejar constancia aparte en la hora 5 en vez de reabrir y
-- reescribir, eso es MÁS limpio, no menos — el cuerpo firmado no se toca.
--
-- La pantalla ofrece "Reabrir" mientras la ventana está viva y "Agregar
-- addendum" siempre; el que elige es el provider.
--
-- ── Por qué nace firmado ────────────────────────────────────────────────────
--
-- Un addendum es una atestiguación, no un borrador: se escribe y se firma en el
-- mismo acto. No hay estado intermedio que administrar, y por eso `signedAt` es
-- NOT NULL. Si alguna vez hiciera falta un borrador de addendum, eso es una
-- columna nueva y una decisión nueva.
--
-- ── Cómo se aplica ──────────────────────────────────────────────────────────
--
--   node scripts/apply-sql.cjs prisma/sql/20260922-addendum-de-la-nota.sql
--
-- Idempotente: se puede correr dos veces sin romper nada.

CREATE TABLE IF NOT EXISTS visit_note_addenda (
  -- DEFAULT a propósito: el resto de las tablas se aplicó con `db push` y
  -- quedaron sin default, así que todo insert que no traiga id muere.
  id             text         NOT NULL DEFAULT gen_random_uuid()::text,
  "visitNoteId"  text         NOT NULL,

  -- Orden de aparición: 1, 2, 3… Es lo que se imprime ("Addendum 2") y lo que
  -- hace que dos addenda del mismo minuto no queden ambiguos.
  numero         integer      NOT NULL,

  -- El texto, en el mismo HTML que las secciones de la nota.
  texto          text         NOT NULL,

  -- Snapshots, no referencias: el nombre tiene que sobrevivir a que la persona
  -- cambie de apellido o deje la clínica. Mismo criterio que visit_note_versions.
  "signedAt"     timestamp(3) NOT NULL,
  "signedById"   text,
  "signedByName" text,

  "createdAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT visit_note_addenda_pkey PRIMARY KEY (id)
);

-- Una sola fila por (nota, número): es lo que impide que dos addenda
-- simultáneos se lleven el mismo número.
CREATE UNIQUE INDEX IF NOT EXISTS visit_note_addenda_nota_numero_key
  ON visit_note_addenda ("visitNoteId", numero);

CREATE INDEX IF NOT EXISTS visit_note_addenda_nota_idx
  ON visit_note_addenda ("visitNoteId");

-- El FK va aparte y con guarda: `ADD CONSTRAINT` no acepta IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visit_note_addenda_visitNoteId_fkey'
  ) THEN
    ALTER TABLE visit_note_addenda
      ADD CONSTRAINT "visit_note_addenda_visitNoteId_fkey"
      FOREIGN KEY ("visitNoteId") REFERENCES visit_notes(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE visit_note_addenda IS
  'Bloques agregados al pie de una nota firmada, cada uno con su fecha y su firma. NO modifican el cuerpo: el original queda intacto. Ver prisma/sql/20260922-addendum-de-la-nota.sql';
