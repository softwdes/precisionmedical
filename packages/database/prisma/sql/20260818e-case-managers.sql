-- 20260818e — Encargados del caso (pedido de Edson)
--
-- La PERSONA vive en el bufete (`lawyers` con parentFirmId), con su email y
-- teléfono escritos una sola vez. Lo que es del caso es la ASIGNACIÓN, y puede
-- haber varias: el correo típico del bufete lista dos o tres encargados.
--
-- Rotan: un case manager se va y nombran a otro. La asignación se CIERRA con
-- `removedAt` en vez de borrarse, para que Edson no pierda a quién le escribió
-- el mes pasado.
--
-- Ver docs/plan-vista-edson.md

CREATE TABLE IF NOT EXISTS "case_managers" (
  "id"             TEXT PRIMARY KEY,
  "caseId"         TEXT NOT NULL,
  "lawyerId"       TEXT NOT NULL,

  "assignedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById"   TEXT,
  "assignedByName" TEXT,

  "removedAt"      TIMESTAMP(3),
  "removedById"    TEXT,

  "notes"          TEXT,

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_managers_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "case_managers_lawyer_fkey"
    FOREIGN KEY ("lawyerId") REFERENCES "lawyers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Una persona no puede estar asignada dos veces al mismo caso. Al reasignar a
-- alguien que ya estuvo, la API revive su fila en vez de duplicarla.
CREATE UNIQUE INDEX IF NOT EXISTS "case_managers_case_lawyer_key"
  ON "case_managers" ("caseId", "lawyerId");

-- El acceso normal es "los encargados ACTUALES de este caso".
CREATE INDEX IF NOT EXISTS "case_managers_case_active_idx"
  ON "case_managers" ("caseId", "removedAt");

CREATE INDEX IF NOT EXISTS "case_managers_lawyer_idx"
  ON "case_managers" ("lawyerId");
