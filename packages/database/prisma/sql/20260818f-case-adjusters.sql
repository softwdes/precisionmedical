-- 20260818f — Adjusters asignados al caso (pedido de Edson)
--
-- Gemelo de `case_managers`: la PERSONA vive en el catálogo (`insurance_adjusters`,
-- por aseguradora, con teléfono/extensión/fax escritos una vez) y lo que es del
-- caso es la ASIGNACIÓN. Son varios — "Kenneth Kelly or Patricia Leon".
--
-- Quitar cierra con `removedAt`: los adjusters rotan y Edson no puede perder a
-- quién le habló el mes pasado.
--
-- La dirección de billing NO va acá: es de la aseguradora (claimsAddress).

CREATE TABLE IF NOT EXISTS "case_adjusters" (
  "id"             TEXT PRIMARY KEY,
  "caseId"         TEXT NOT NULL,
  "adjusterId"     TEXT NOT NULL,

  "assignedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById"   TEXT,
  "assignedByName" TEXT,

  "removedAt"      TIMESTAMP(3),
  "removedById"    TEXT,

  "notes"          TEXT,

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_adjusters_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "case_adjusters_adjuster_fkey"
    FOREIGN KEY ("adjusterId") REFERENCES "insurance_adjusters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "case_adjusters_case_adjuster_key"
  ON "case_adjusters" ("caseId", "adjusterId");

CREATE INDEX IF NOT EXISTS "case_adjusters_case_active_idx"
  ON "case_adjusters" ("caseId", "removedAt");

CREATE INDEX IF NOT EXISTS "case_adjusters_adjuster_idx"
  ON "case_adjusters" ("adjusterId");
