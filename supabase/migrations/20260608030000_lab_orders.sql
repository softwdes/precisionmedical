-- ═══════════════════════════════════════════════════════════════════
-- B.20 — lab_orders
-- Órdenes de laboratorio / imaging / cardiología creadas por el doctor.
-- ═══════════════════════════════════════════════════════════════════

-- Ensure trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create enum types (ignore if already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_order_type') THEN
    CREATE TYPE lab_order_type AS ENUM ('LABORATORY', 'IMAGING', 'CARDIOLOGY', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_order_urgency') THEN
    CREATE TYPE lab_order_urgency AS ENUM ('STAT', 'URGENT', 'ROUTINE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_order_status') THEN
    CREATE TYPE lab_order_status AS ENUM ('ORDERED', 'IN_PROGRESS', 'RESULTED', 'VOIDED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS lab_orders (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  appointment_id  TEXT NOT NULL REFERENCES appointments(id),
  visit_note_id   TEXT REFERENCES visit_notes(id) ON DELETE SET NULL,

  order_type          lab_order_type    NOT NULL,
  study_name          TEXT              NOT NULL,
  loinc_code          TEXT,
  clinical_indication TEXT              NOT NULL,
  urgency             lab_order_urgency NOT NULL DEFAULT 'ROUTINE',
  preferred_center    TEXT,
  icd10_codes         TEXT[]            NOT NULL DEFAULT '{}',

  status          lab_order_status NOT NULL DEFAULT 'ORDERED',
  ordered_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ordered_by_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_appointment
  ON lab_orders (appointment_id);

CREATE INDEX IF NOT EXISTS idx_lab_orders_visit_note
  ON lab_orders (visit_note_id);

DROP TRIGGER IF EXISTS set_updated_at_lab_orders ON lab_orders;
CREATE TRIGGER set_updated_at_lab_orders
  BEFORE UPDATE ON lab_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
