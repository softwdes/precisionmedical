-- ═══════════════════════════════════════════════════════════════════
-- B.19 — prescriptions
-- Prescripciones electrónicas del doctor.
-- Phase 1A: almacena localmente. Phase 2: integración DAW/EPCS.
-- Status: DRAFT | SENT (non-controlled) | PENDING_DAW (controlled)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rx_status') THEN
    CREATE TYPE rx_status AS ENUM ('DRAFT', 'SENT', 'PENDING_DAW', 'VOIDED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS prescriptions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  appointment_id  TEXT NOT NULL REFERENCES appointments(id),
  visit_note_id   TEXT REFERENCES visit_notes(id) ON DELETE SET NULL,

  -- Drug info snapshot
  drug_name       TEXT NOT NULL,            -- "Oxycodone 10mg Tab"
  drug_generic    TEXT,                     -- "Oxycodone HCl"
  dea_schedule    TEXT,                     -- 'II','III','IV','V' | NULL (non-controlled)

  -- Rx details
  dose            TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration_str    TEXT NOT NULL,
  quantity_total  INT  NOT NULL,
  refills         INT  NOT NULL DEFAULT 0,
  clinical_indication TEXT NOT NULL,

  -- Pharmacy
  pharmacy_name   TEXT,
  pharmacy_address TEXT,

  -- Prescriber snapshot
  prescriber_name TEXT,
  prescriber_dea  TEXT,

  -- Status
  status          rx_status NOT NULL DEFAULT 'DRAFT',

  -- DAW integration fields (Phase 2)
  daw_rx_id       TEXT,
  daw_sent_at     TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_note  ON prescriptions (visit_note_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status      ON prescriptions (status);

DROP TRIGGER IF EXISTS set_updated_at_prescriptions ON prescriptions;
CREATE TRIGGER set_updated_at_prescriptions
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
