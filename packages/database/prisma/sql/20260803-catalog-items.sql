-- =============================================================================
-- Catálogo de precios · labs · inyectables · servicios · férulas
-- 2026-08-03
-- =============================================================================
-- Reemplaza el Excel "LabCorp Lab Pricing" que la clínica mantiene a mano.
-- DDL escrito a mano (equivalente exacto a `prisma db push`) porque el session
-- pooler de Supabase (:5432) no responde y el migration engine lo requiere.
-- Se aplica por el transaction pooler (:6543).
--
-- No modifica ninguna tabla existente. Solo agrega 2 tipos y 2 tablas.
-- =============================================================================

CREATE TYPE "catalog_item_kind" AS ENUM ('LAB', 'INJECTION', 'SERVICE', 'DME');

CREATE TYPE "catalog_price_status" AS ENUM ('VERIFIED', 'UNVERIFIED', 'UPDATE_REQUESTED');

CREATE TABLE "catalog_items" (
    "id"                SERIAL                 NOT NULL,
    "kind"              "catalog_item_kind"    NOT NULL,
    "code"              TEXT                   NOT NULL,
    "name"              TEXT                   NOT NULL,
    "category"          TEXT,
    "section"           TEXT,
    "loinc"             TEXT,
    "vendor"            TEXT                   NOT NULL DEFAULT 'IN_HOUSE',

    -- Precios: los cuatro kinds llevan costo real y precio público
    "costPrice"         DECIMAL(10,2),
    "publicPrice"       DECIMAL(10,2),
    "memberPrice"       DECIMAL(10,2),
    "priceNote"         TEXT,
    "unitLabel"         TEXT,

    -- Reflex (labs)
    "hasReflex"         BOOLEAN                NOT NULL DEFAULT false,
    "reflexCost"        DECIMAL(10,2),
    "reflexPrice"       DECIMAL(10,2),
    "reflexPolicy"      TEXT,

    -- Muestra (labs)
    "tubeColors"        TEXT[]                 DEFAULT ARRAY[]::TEXT[],
    "containerType"     TEXT,
    "specialHandling"   TEXT,

    -- DME
    "sizeLabel"         TEXT,
    "alwaysFullPayment" BOOLEAN                NOT NULL DEFAULT false,

    -- Puente a facturación (opcional)
    "cptCode"           TEXT,
    "hcpcsCode"         TEXT,
    "ndcCode"           TEXT,

    -- Verificación de precio
    "priceStatus"       "catalog_price_status" NOT NULL DEFAULT 'UNVERIFIED',
    "priceVerifiedAt"   TIMESTAMP(3),
    "priceVerifiedBy"   TEXT,

    -- Estado
    "isActive"          BOOLEAN                NOT NULL DEFAULT true,
    "isOrderable"       BOOLEAN                NOT NULL DEFAULT true,
    "replacedByCode"    TEXT,
    "notes"             TEXT,
    "sortOrder"         INTEGER                NOT NULL DEFAULT 0,

    "createdAt"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)           NOT NULL,
    "deletedAt"         TIMESTAMP(3),

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_items_code_key"          ON "catalog_items" ("code");
CREATE INDEX        "catalog_items_kind_idx"          ON "catalog_items" ("kind");
CREATE INDEX        "catalog_items_kind_category_idx" ON "catalog_items" ("kind", "category");
CREATE INDEX        "catalog_items_priceStatus_idx"   ON "catalog_items" ("priceStatus");
CREATE INDEX        "catalog_items_isActive_idx"      ON "catalog_items" ("isActive");

CREATE TABLE "catalog_price_history" (
    "id"            SERIAL       NOT NULL,
    "itemId"        INTEGER      NOT NULL,
    "costPrice"     DECIMAL(10,2),
    "publicPrice"   DECIMAL(10,2),
    "memberPrice"   DECIMAL(10,2),
    "changedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByName" TEXT,
    "reason"        TEXT,

    CONSTRAINT "catalog_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_price_history_itemId_changedAt_idx"
    ON "catalog_price_history" ("itemId", "changedAt");

ALTER TABLE "catalog_price_history"
    ADD CONSTRAINT "catalog_price_history_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "catalog_items" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
