-- 20260818b — Seguro de auto del caso (paso 2 de la vista de tracking de Edson)
--
-- Promueve a tabla lo que hoy vive dentro del blob `cases.consentsData.insurances[]`.
-- Motivo: el JSON no deja filtrar/ordenar por claim ni adjuster, y el guardado
-- manda el array COMPLETO, así que recepción y Edson se pisan al editar a la vez.
--
-- NO duplica aseguradora ni fecha de accidente: ya viven en `cases`.
-- Ver docs/plan-vista-edson.md §3.1

DO $$ BEGIN
  CREATE TYPE "PipAvailability" AS ENUM ('YES', 'NO', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "case_auto_insurances" (
  "id"               TEXT PRIMARY KEY,
  "caseId"           TEXT NOT NULL,

  "carrierId"        TEXT,
  "carrierNameRaw"   TEXT,

  "policyId"         TEXT,
  "lossDate"         TIMESTAMP(3),

  "pipAvailable"     "PipAvailability" NOT NULL DEFAULT 'UNKNOWN',
  "claimNum"         TEXT,

  "adjusterId"       TEXT,
  "adjusterNameRaw"  TEXT,
  "adjusterPhoneRaw" TEXT,

  "comments"         TEXT,

  "fullLien"         BOOLEAN NOT NULL DEFAULT false,
  "lienComments"     TEXT,

  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_auto_insurances_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "case_auto_insurances_carrier_fkey"
    FOREIGN KEY ("carrierId") REFERENCES "insurance_carriers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "case_auto_insurances_adjuster_fkey"
    FOREIGN KEY ("adjusterId") REFERENCES "insurance_adjusters"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- Un seguro de auto por caso: es la relación 1:1 que el JSON no podía garantizar.
CREATE UNIQUE INDEX IF NOT EXISTS "case_auto_insurances_caseId_key"
  ON "case_auto_insurances" ("caseId");

CREATE INDEX IF NOT EXISTS "case_auto_insurances_carrier_idx"  ON "case_auto_insurances" ("carrierId");
CREATE INDEX IF NOT EXISTS "case_auto_insurances_adjuster_idx" ON "case_auto_insurances" ("adjusterId");
CREATE INDEX IF NOT EXISTS "case_auto_insurances_pip_idx"      ON "case_auto_insurances" ("pipAvailable");
CREATE INDEX IF NOT EXISTS "case_auto_insurances_claim_idx"    ON "case_auto_insurances" ("claimNum");
