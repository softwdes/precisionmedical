-- 20260818 — Catálogo de ajustadores (paso 1 de la vista de tracking de Edson)
--
-- Un adjuster pertenece a UNA aseguradora. Hoy el nombre y el teléfono se
-- escriben a mano en cada caso (dentro del JSON `cases.consentsData`), así que
-- la misma persona aparece repetida con la extensión escrita distinta cada vez.
-- Este catálogo es lo que permite que el adjuster pase a ser un selector.
--
-- Ver docs/plan-vista-edson.md §3.2

CREATE TABLE IF NOT EXISTS "insurance_adjusters" (
  "id"                 TEXT PRIMARY KEY,
  "insuranceCarrierId" TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "phone"              TEXT,
  "extension"          TEXT,
  "phone2"             TEXT,
  "fax"                TEXT,
  "email"              TEXT,
  "notes"              TEXT,
  "status"             "ExternalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"          TIMESTAMP(3),

  CONSTRAINT "insurance_adjusters_carrier_fkey"
    FOREIGN KEY ("insuranceCarrierId")
    REFERENCES "insurance_carriers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Un nombre por aseguradora. Es la restricción que impide que "Maria" vuelva a
-- entrar tres veces; la API revive el registro soft-deleted en vez de chocar.
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_adjusters_carrier_name_key"
  ON "insurance_adjusters" ("insuranceCarrierId", "name");

CREATE INDEX IF NOT EXISTS "insurance_adjusters_carrier_idx"
  ON "insurance_adjusters" ("insuranceCarrierId");

CREATE INDEX IF NOT EXISTS "insurance_adjusters_status_idx"
  ON "insurance_adjusters" ("status");
