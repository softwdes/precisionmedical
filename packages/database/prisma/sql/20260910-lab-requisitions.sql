-- La REQUISICIÓN de laboratorio: la hoja que el paciente lleva al laboratorio.
--
-- Una fila por GRUPO de estudios (`lab_orders.groupId`): una orden son N
-- estudios en UNA hoja con UN número. Se crea al apretar "Generar orden",
-- después de consultarle al paciente — no antes, porque hasta ese momento los
-- estudios son un borrador y un número emitido para algo que todavía cambia no
-- identifica nada.

CREATE TABLE IF NOT EXISTS lab_requisitions (
  "id"              TEXT PRIMARY KEY,
  "groupId"         TEXT NOT NULL UNIQUE,
  "number"          TEXT NOT NULL UNIQUE,
  "billingType"     "LabBillingType" NOT NULL,
  "providerId"      TEXT,
  "providerName"    TEXT,
  "providerNpi"     TEXT,
  "generatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedById"   TEXT,
  "generatedByName" TEXT,
  "documentId"      TEXT
);

CREATE INDEX IF NOT EXISTS "lab_requisitions_generatedAt_idx"
  ON lab_requisitions ("generatedAt");

-- ── La secuencia del número ─────────────────────────────────────────────────
--
-- Arranca en 2000000000, DELIBERADAMENTE LEJOS del rango de MedUSA.
--
-- Las dos órdenes reales que trajo Erick son `1000005856-PM` y `1000005857-PM`,
-- o sea que MedUSA va por 1.000.005.8xx y sigue emitiendo. Si nuestra secuencia
-- arrancara cerca, en algún momento las dos numeraciones se cruzarían y el
-- laboratorio tendría **dos requisiciones distintas con el mismo número** — una
-- de ellos y una nuestra. Con el tubo ya etiquetado, eso es una muestra
-- atribuida a la orden equivocada.
--
-- El FORMATO es el mismo que pidió Erick (`#######-PM`); lo que cambia es el
-- rango, que es justamente lo que evita el choque.
CREATE SEQUENCE IF NOT EXISTS lab_requisition_seq
  AS BIGINT START WITH 2000000000 INCREMENT BY 1 NO CYCLE;
