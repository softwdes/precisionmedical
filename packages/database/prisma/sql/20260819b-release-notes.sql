-- 20260819b — Notas de release para el banner "Actualizar"
--
-- Al apretar Update se muestra un listado de lo que se hizo, agrupado por
-- módulo, en el idioma de la cookie `locale` y filtrado por audiencia.
--
-- Una fila por DEPLOY en vez de devolver las notas del build actual en
-- /api/version: con `turbo-ignore` salteando builds, un usuario puede quedar
-- varios deploys atrás y necesita ver todo lo acumulado, no sólo el último.
--
-- Todo nace en DRAFT. El script del build (scripts/build-release-notes.ts)
-- parsea el `git log` y nadie ve nada hasta que se publica a mano: hay commits
-- que no se publican —`fix(security): el Admin dejaba ver plata a cualquiera
-- con sesión iniciada` le regala el mapa a quien lea el banner— y hay tres
-- commits de `tracking` que se leen mejor como una sola línea.

DO $$ BEGIN
    CREATE TYPE "release_status" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sólo `feat` y `fix` llegan acá; `chore`, `docs`, `refactor` y `style` no se
-- publican. `perf` e `i18n` entran como FEAT: el usuario los ve.
DO $$ BEGIN
    CREATE TYPE "release_note_kind" AS ENUM ('FEAT', 'FIX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La audiencia NO es la app. `back-office` sirve tres audiencias desde tres
-- route groups —(admin), doctor y attorney— y al revés, `doctor` vive en
-- `back-office/app/doctor` y también en `clinical/app/doctor`.
--
-- PATIENT existe para completar el mapeo de rutas (`forms/intake`, `cita`, `c`)
-- pero nunca recibe notas: a alguien llenando su intake no se le cuenta que se
-- corrigió un cargo CPT duplicado.
DO $$ BEGIN
    CREATE TYPE "release_audience" AS ENUM
        ('ADMIN', 'DOCTOR', 'ATTORNEY', 'CLINIC', 'TIMECLOCK', 'PATIENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "releases" (
  "id"              TEXT             PRIMARY KEY,

  -- App del monorepo. TEXT y no enum: agregar una app no debería pedir migración.
  "app"             TEXT             NOT NULL,
  "sha"             TEXT             NOT NULL,
  -- SHA del release anterior de esta app: el `from` del rango de `git log`.
  "previousSha"     TEXT,

  "status"          "release_status" NOT NULL DEFAULT 'DRAFT',

  "deployedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "publishedAt"     TIMESTAMP(3),
  "publishedById"   TEXT,
  -- Denormalizado: la lista de /admin/releases muestra quién publicó sin join
  -- (mismo criterio que `case_tracking.completedByName`).
  "publishedByName" TEXT,

  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un re-deploy del mismo commit no crea un release nuevo ni pisa lo curado.
CREATE UNIQUE INDEX IF NOT EXISTS "releases_app_sha_key"
  ON "releases" ("app", "sha");

-- "el último release de esta app" — lo que busca el script en cada build.
CREATE INDEX IF NOT EXISTS "releases_app_status_deployedAt_idx"
  ON "releases" ("app", "status", "deployedAt");

-- "lo publicado después de tal fecha" — lo que pide /api/changelog.
CREATE INDEX IF NOT EXISTS "releases_status_publishedAt_idx"
  ON "releases" ("status", "publishedAt");

CREATE TABLE IF NOT EXISTS "release_entries" (
  "id"          TEXT                NOT NULL,
  "releaseId"   TEXT                NOT NULL,

  "kind"        "release_note_kind" NOT NULL,

  -- Commit del que salió, para rastrear la línea hasta el código.
  "commitSha"   TEXT                NOT NULL,
  -- Scope crudo, tal como vino. Los scopes NO son módulos: hay 74 distintos en
  -- el historial, con ES y EN mezclados y duplicados (`rx` y `recetas`, `pagos`
  -- y `charges` y `billing` y `finanzas`). `module` es la versión curada y esto
  -- la trazabilidad.
  "commitScope" TEXT,

  -- CLAVE del módulo (`tracking`, `billing`, `prescriptions`), no la etiqueta:
  -- el nombre visible sale de MODULE_LABELS en @precision/release y así se
  -- traduce solo.
  "module"      TEXT                NOT NULL,

  -- A quién le afecta. Se deriva de los PATHS que tocó el commit, no del scope:
  -- `feat(ui): primitivo Section` toca `packages/ui` y le afecta a todos.
  "audiences"   "release_audience"[],

  -- Los commits están escritos en español, así que esto llega lleno.
  "textEs"      TEXT                NOT NULL,
  -- El inglés hay que escribirlo. Un release no se publica con esto en NULL en
  -- una entrada visible: el locale sale de la cookie y si el usuario está en EN
  -- tiene que ver todo en EN. La validación va en la API, no acá.
  "textEn"      TEXT,

  -- Excluida de la publicación sin perder el registro (los de seguridad).
  "hidden"      BOOLEAN             NOT NULL DEFAULT FALSE,

  "sortOrder"   INTEGER             NOT NULL DEFAULT 0,

  -- Pide ojo humano: scope sin mapear, audiencia ambigua (sólo tocó código
  -- compartido) o marcada sensible. Es por lo que ordena /admin/releases.
  "needsReview" BOOLEAN             NOT NULL DEFAULT FALSE,

  "createdAt"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "release_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "release_entries_release_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "releases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- El acceso normal es "las notas de este release, agrupadas por módulo".
CREATE INDEX IF NOT EXISTS "release_entries_releaseId_module_sortOrder_idx"
  ON "release_entries" ("releaseId", "module", "sortOrder");

CREATE INDEX IF NOT EXISTS "release_entries_commitSha_idx"
  ON "release_entries" ("commitSha");
