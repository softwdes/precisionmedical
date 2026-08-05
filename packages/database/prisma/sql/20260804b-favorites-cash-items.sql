-- =============================================================================
-- Favoritos también para el catálogo cash
-- 2026-08-04
-- =============================================================================
-- `user_service_favorites` solo podía guardar códigos de `service_codes`
-- (`serviceCodeId` NOT NULL con FK), así que el doctor podía marcar como
-- favorito un CPT a seguro pero NO un inyectable en efectivo. Peor: el botón
-- "Favoritos" del picker no hacía nada en la vista de efectivo — filtraba una
-- lista que no tenía favoritos posibles.
--
-- UNA tabla con dos tipos, no dos tablas:
--   · El picker ordena "favoritos primero" en UNA consulta. Con dos tablas hay
--     que traer las dos y mezclar en memoria.
--   · `usageCount`/`lastUsedAt` son la misma métrica para las dos fuentes;
--     duplicar la tabla duplica esa lógica y una de las copias queda sin
--     mantener.
--
-- El CHECK garantiza que cada fila apunte a UNO y solo uno de los dos catálogos:
-- una fila con los dos (o con ninguno) no significa nada.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE "user_service_favorites"
    ALTER COLUMN "serviceCodeId" DROP NOT NULL;

-- Sin FK a `catalog_items` a propósito, igual que en appointment_services: el
-- catálogo es soft-delete y el favorito no debe hacer fallar un borrado lógico.
ALTER TABLE "user_service_favorites"
    ADD COLUMN IF NOT EXISTS "catalogItemId" INTEGER;

-- NULLs no colisionan en un unique de Postgres, así que este índice conviven sin
-- problema con el de serviceCodeId.
CREATE UNIQUE INDEX IF NOT EXISTS "user_service_favorites_userId_catalogItemId_key"
    ON "user_service_favorites"("userId", "catalogItemId");

CREATE INDEX IF NOT EXISTS "user_service_favorites_catalogItemId_idx"
    ON "user_service_favorites"("catalogItemId");

DO $$ BEGIN
    ALTER TABLE "user_service_favorites"
        ADD CONSTRAINT "user_service_favorites_one_target"
        CHECK (num_nonnulls("serviceCodeId", "catalogItemId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
