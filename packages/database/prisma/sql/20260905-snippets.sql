-- =============================================================================
-- Snippets por sección de la nota clínica — F1 del plan Settings del portal
-- 2026-09-05 · docs/plan-settings-portal-snippets.md
-- =============================================================================
-- Qué es: la pieza de Medusa ("My Settings → History of Presenting Illness →
-- snippets"). Un snippet es HTML con formato atado a UNA sección de la nota
-- (`sectionKey`, el mismo enum de las plantillas). En la nota, el provider hace
-- clic en el título de la sección, elige un snippet y el HTML se AGREGA en el
-- cursor. Lo que queda guardado es lo que se imprime.
--
-- Tabla propia y no una extensión de `template_sections`: la plantilla es la
-- nota completa, el snippet es un pedazo de una sección, y un snippet no
-- pertenece a ninguna plantilla.
--
-- Globales con favoritos personales, misma regla que `templates` +
-- `template_favorites` (Erick 2026-07-28 / 2026-09-05).
--
-- DDL a mano, idempotente, por el mismo motivo que 20260807b: `db push` arrastra
-- la deriva de todo el schema (~47 sentencias ajenas con DROP CONSTRAINT en tres
-- tablas) y el session pooler no responde a `migrate diff --from-url`. Se aplica
-- SOLO esto, con el dev server apagado, y después `prisma generate`.
--
-- Los `id` NO llevan DEFAULT: igual que el resto de la base, el cuid lo genera
-- Prisma Client en la app (ver trap-cuid-default-no-existe-en-la-db). Todo
-- insert va por Prisma, nunca por REST.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "snippets" (
    "id"          TEXT NOT NULL,
    "sectionKey"  "TemplateSectionKey" NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "content"     TEXT NOT NULL,
    "scope"       "TemplateScope" NOT NULL DEFAULT 'SHARED',
    "createdById" TEXT NOT NULL,
    "usageCount"  INTEGER NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "deletedAt"   TIMESTAMP(3),

    CONSTRAINT "snippets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "snippets_sectionKey_idx"  ON "snippets"("sectionKey");
CREATE INDEX IF NOT EXISTS "snippets_createdById_idx" ON "snippets"("createdById");

-- FK con el nombre y la regla que Prisma espera (relación REQUERIDA sin
-- `onDelete` → RESTRICT), para que un futuro diff no la quiera recrear.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snippets_createdById_fkey') THEN
    ALTER TABLE "snippets"
      ADD CONSTRAINT "snippets_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "snippet_favorites" (
    "id"         TEXT NOT NULL,
    "snippetId"  TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snippet_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "snippet_favorites_snippetId_userId_key" ON "snippet_favorites"("snippetId", "userId");
CREATE INDEX IF NOT EXISTS "snippet_favorites_userId_idx" ON "snippet_favorites"("userId");

-- `onDelete: Cascade` declarado en el schema: borrar (duro) un snippet se lleva
-- sus estrellas. El favorito → usuario es requerido sin onDelete → RESTRICT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snippet_favorites_snippetId_fkey') THEN
    ALTER TABLE "snippet_favorites"
      ADD CONSTRAINT "snippet_favorites_snippetId_fkey"
      FOREIGN KEY ("snippetId") REFERENCES "snippets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snippet_favorites_userId_fkey') THEN
    ALTER TABLE "snippet_favorites"
      ADD CONSTRAINT "snippet_favorites_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Dos tablas, tres FK con estos nombres exactos, cero filas.
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid IN ('snippets'::regclass, 'snippet_favorites'::regclass)
--      AND contype = 'f';
--   SELECT count(*) FROM snippets;
