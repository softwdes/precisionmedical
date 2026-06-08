-- ═══════════════════════════════════════════════════════════════════
-- B.21 — visit_service_codes
-- CPT codes asignados a una visita por el doctor antes de firmar.
-- Fee editable inline (override vs catálogo). Append-only en audit.
-- ═══════════════════════════════════════════════════════════════════

-- Ensure shared trigger function exists (create if missing)
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS visit_service_codes (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  visit_note_id   TEXT NOT NULL REFERENCES visit_notes(id) ON DELETE CASCADE,
  service_code_id TEXT REFERENCES service_codes(id) ON DELETE SET NULL,

  -- Snapshot al momento de asignación
  cpt_code        TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  fee_catalog     DECIMAL(10,2) NOT NULL,   -- Fee del catálogo en ese momento
  fee_override    DECIMAL(10,2),            -- NULL = usar fee_catalog
  override_reason TEXT,                     -- Motivo del override (si aplica)

  modifier        TEXT,                     -- "-25", "-59", etc.
  units           INT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (visit_note_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_visit_service_codes_note
  ON visit_service_codes (visit_note_id);

DROP TRIGGER IF EXISTS set_updated_at_visit_service_codes ON visit_service_codes;
CREATE TRIGGER set_updated_at_visit_service_codes
  BEFORE UPDATE ON visit_service_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
