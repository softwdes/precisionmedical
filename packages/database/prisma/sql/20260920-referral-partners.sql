-- =============================================================================
-- Catálogo de referidores — 2026-09-20 · proyecto PHOENIX
-- =============================================================================
-- Quién nos manda pacientes y NO es un bufete: quiroprácticos, centros de
-- accidente, otras clínicas. Hasta hoy era texto libre en tres lugares
-- distintos y el desplegable de "Chiropractor" buscaba contra los providers
-- PROPIOS de la clínica (20, todos con especialidad GENERAL), así que nunca
-- podía ofrecer un quiropráctico: lo que quedaba escrito lo tecleaba recepción.
--
-- Medido el 2026-09-20 sobre 600 pacientes: 98 declaran que los mandó un
-- quiropráctico — la segunda fuente más común, detrás de OTHER — y en casi
-- ninguno se sabe cuál. En TODA la base hay 15 valores escritos, con "Axcess /
-- Axcess Referral / Axcess AF Referral" para el mismo lugar y "Michael Grant /
-- Mike Grant" para la misma persona.
--
-- Idempotente: se puede correr dos veces sin duplicar nada.
--
-- ── Lo que hace el backfill ─────────────────────────────────────────────────
--
-- Carga el catálogo con los nombres que YA se escribieron (los de 3 letras o
-- más: quedan afuera "b" y "f", que fueron un dedazo) y engancha por nombre
-- exacto los casos y pacientes que ya los tenían. NO fusiona los parecidos:
-- "Axcess" y "Axcess Referral" entran como dos filas, porque decidir que son el
-- mismo lugar es criterio de la clínica, no de una consulta. Se juntan con el
-- botón "Fusionar" de Configuración → Referidores, que mueve los casos y los
-- pacientes de uno al otro antes de borrarlo.
--
-- La única clasificación automática es "axcess" → ACCIDENT_CENTER, y sale del
-- propio schema, que ya lo documenta así (`ReferralSource.ACCIDENT_CENTER` —
-- "Centro de accidentes (ej. Axcess)"). El resto entra como CHIROPRACTOR y se
-- corrige desde la misma pantalla.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "ReferralPartnerType" AS ENUM ('CHIROPRACTOR', 'ACCIDENT_CENTER', 'MEDICAL_PROVIDER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "referral_partners" (
  "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "type"        "ReferralPartnerType" NOT NULL DEFAULT 'CHIROPRACTOR',
  "name"        text NOT NULL,
  "contactName" text,
  "phone"       text,
  "email"       text,
  "address"     text,
  "city"        text,
  "state"       text,
  "zip"         text,
  "notes"       text,
  "status"      "ExternalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   timestamp(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_partners_name_key"   ON "referral_partners" ("name");
CREATE        INDEX IF NOT EXISTS "referral_partners_type_idx"   ON "referral_partners" ("type");
CREATE        INDEX IF NOT EXISTS "referral_partners_status_idx" ON "referral_partners" ("status");

-- ── El referidor del PACIENTE (hermano de `lawyerReferrerId`) ───────────────

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "referralPartnerId" text;

CREATE INDEX IF NOT EXISTS "patients_referralPartnerId_idx" ON "patients" ("referralPartnerId");

DO $$ BEGIN
  ALTER TABLE "patients"
    ADD CONSTRAINT "patients_referralPartnerId_fkey"
    FOREIGN KEY ("referralPartnerId") REFERENCES "referral_partners"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── El quiropráctico del CASO, el que la clínica reconoce ───────────────────
-- Va al lado de `chiroReferral` y no lo reemplaza: el texto guarda lo que se
-- escribió cuando no había catálogo, y `consentsData->'chiropractor'` —que es
-- lo que el PACIENTE declaró en su formulario firmado— no se toca nunca.

ALTER TABLE "case_tracking" ADD COLUMN IF NOT EXISTS "referralPartnerId" text;

CREATE INDEX IF NOT EXISTS "case_tracking_referralPartnerId_idx" ON "case_tracking" ("referralPartnerId");

DO $$ BEGIN
  ALTER TABLE "case_tracking"
    ADD CONSTRAINT "case_tracking_referralPartnerId_fkey"
    FOREIGN KEY ("referralPartnerId") REFERENCES "referral_partners"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Backfill
-- =============================================================================

INSERT INTO "referral_partners" ("name", "type", "notes")
SELECT
  t.name,
  CASE WHEN t.name ILIKE '%axcess%' THEN 'ACCIDENT_CENTER'::"ReferralPartnerType"
       ELSE 'CHIROPRACTOR'::"ReferralPartnerType" END,
  'Cargado del histórico el 2026-09-20 · revisar tipo y duplicados'
FROM (
  SELECT DISTINCT btrim(ct."chiroReferral") AS name
    FROM "case_tracking" ct
   WHERE btrim(coalesce(ct."chiroReferral", '')) <> ''
  UNION
  SELECT DISTINCT btrim(c."consentsData" ->> 'chiropractor') AS name
    FROM "cases" c
   WHERE btrim(coalesce(c."consentsData" ->> 'chiropractor', '')) <> ''
) t
WHERE length(t.name) >= 3
ON CONFLICT ("name") DO NOTHING;

-- Casos que ya tenían el nombre corregido por Edson.
UPDATE "case_tracking" ct
   SET "referralPartnerId" = p."id"
  FROM "referral_partners" p
 WHERE ct."referralPartnerId" IS NULL
   AND btrim(coalesce(ct."chiroReferral", '')) = p."name";

-- Casos donde el nombre solo está en lo que declaró el paciente.
UPDATE "case_tracking" ct
   SET "referralPartnerId" = p."id"
  FROM "cases" c, "referral_partners" p
 WHERE ct."caseId" = c."id"
   AND ct."referralPartnerId" IS NULL
   AND btrim(coalesce(c."consentsData" ->> 'chiropractor', '')) = p."name";

-- Pacientes que traían el nombre en el texto libre de "cómo nos encontró".
UPDATE "patients" pt
   SET "referralPartnerId" = p."id"
  FROM "referral_partners" p
 WHERE pt."referralPartnerId" IS NULL
   AND btrim(coalesce(pt."referralSourceOther", '')) = p."name";

-- =============================================================================
-- Control — qué quedó cargado y cuánto enganchó
-- =============================================================================

SELECT "type", count(*) AS filas FROM "referral_partners" WHERE "deletedAt" IS NULL GROUP BY "type" ORDER BY 1;

SELECT p."name",
       (SELECT count(*) FROM "case_tracking" ct WHERE ct."referralPartnerId" = p."id") AS casos,
       (SELECT count(*) FROM "patients" pt     WHERE pt."referralPartnerId" = p."id") AS pacientes
  FROM "referral_partners" p
 WHERE p."deletedAt" IS NULL
 ORDER BY 2 DESC, 1 ASC;
