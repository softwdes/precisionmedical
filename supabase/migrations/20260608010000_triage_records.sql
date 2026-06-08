-- B.16 · Triaje MA — tabla triage_records
-- Almacena signos vitales + chief complaint capturados por el MA
-- antes de la visita del doctor. 1:1 con appointments.

CREATE TABLE IF NOT EXISTS triage_records (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "appointmentId"      TEXT        NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,

  -- Height
  "heightFt"           INTEGER,
  "heightIn"           INTEGER,
  "heightCm"           DOUBLE PRECISION,

  -- Weight
  "weightLbs"          INTEGER,
  "weightOz"           INTEGER,
  "weightKg"           DOUBLE PRECISION,

  -- Blood Pressure
  "systolicMmhg"       INTEGER,
  "diastolicMmhg"      INTEGER,

  -- Pulse & Temperature
  "pulseBpm"           INTEGER,
  "tempFahrenheit"     DOUBLE PRECISION,
  "tempCelsius"        DOUBLE PRECISION,

  -- Oxygen
  "o2Saturation"       INTEGER,
  "onRoomAir"          BOOLEAN     NOT NULL DEFAULT true,

  -- Vision Acuity (denominator of 20/X stored as text)
  "visualAcuityRight"  TEXT,
  "visualAcuityLeft"   TEXT,
  "visualAcuityBoth"   TEXT,
  "visionCorrected"    BOOLEAN     NOT NULL DEFAULT false,

  -- Chief Complaint
  "chiefComplaint"     TEXT,

  -- Meta
  "capturedByUserId"   TEXT,
  "capturedByName"     TEXT        DEFAULT 'MA',

  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updatedAt
CREATE OR REPLACE FUNCTION update_triage_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER triage_records_updated_at
  BEFORE UPDATE ON triage_records
  FOR EACH ROW EXECUTE FUNCTION update_triage_records_updated_at();

-- Index para lookup por appointment
CREATE INDEX IF NOT EXISTS idx_triage_records_appointment
  ON triage_records("appointmentId");
