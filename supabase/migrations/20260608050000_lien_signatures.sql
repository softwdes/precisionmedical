-- ═══════════════════════════════════════════════════════════════════
-- B.22 — lien_signatures
-- Firmas digitales del lien médico por rol (PATIENT / ATTORNEY / DOCTOR)
-- Append-only · audit record permanente
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lien_signer_type') THEN
    CREATE TYPE lien_signer_type AS ENUM ('PATIENT', 'ATTORNEY', 'DOCTOR', 'CLINIC');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS lien_signatures (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id         TEXT NOT NULL REFERENCES cases(id),

  -- Quién firmó
  signer_type     lien_signer_type NOT NULL,
  signer_name     TEXT NOT NULL,           -- nombre snapshot al firmar
  signer_email    TEXT,                    -- email snapshot

  -- Datos de la firma
  signature_svg   TEXT,                    -- SVG path data del canvas
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit / HIPAA
  ip_address      TEXT,
  user_agent      TEXT,
  session_token   TEXT,                    -- token de acceso usado (hash)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lien_signatures_case    ON lien_signatures (case_id);
CREATE INDEX IF NOT EXISTS idx_lien_signatures_type    ON lien_signatures (signer_type);
CREATE INDEX IF NOT EXISTS idx_lien_signatures_signed  ON lien_signatures (signed_at);
