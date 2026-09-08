-- =============================================================================
-- Pedidos de bufete por ESCRITORIO — 2026-09-07
-- =============================================================================
-- Erick: "algo como Vigía para los correos, sin modelo": cuando el bufete
-- aprieta "Pedirle esto a la clínica", elige un TEMA con botones y el sistema
-- decide a quién le llega. Tres escritorios:
--
--   CLINICAL — lo médico, preguntas a los providers, plan de tratamiento (Beatriz)
--   INTAKE   — admisión antes de la primera visita, PIP, datos del case manager
--              y del abogado (Edson)
--   BILLING  — ledger, firma del lien, saldo de liquidación, copia de notas del
--              provider y HCFA (Brunella)
--
-- Los nombres NO van en el código: quién atiende cada escritorio vive en
-- `message_desk_members` y se edita desde Configuración. La variable de
-- entorno `VIGIA_REQUEST_RECIPIENTS` queda como último respaldo.
--
-- El hilo guarda el escritorio, el sub-tema y el bufete de origen. Sin eso el
-- tema serviría solo para elegir destinatario y después no habría filtro para
-- el admin, ni reasignación, ni medida de "sin responder".
--
-- Aplicar con `prisma db execute` (el pooler :6543 acepta DDL). Idempotente.
-- NO usar `db push`: arrastra la deriva de otras sesiones.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_desk') THEN
    CREATE TYPE "message_desk" AS ENUM ('CLINICAL', 'INTAKE', 'BILLING');
  END IF;
END $$;

ALTER TABLE "message_threads" ADD COLUMN IF NOT EXISTS "desk"   "message_desk";
ALTER TABLE "message_threads" ADD COLUMN IF NOT EXISTS "topic"  text;
ALTER TABLE "message_threads" ADD COLUMN IF NOT EXISTS "firmId" text;

CREATE INDEX IF NOT EXISTS "message_threads_firmId_idx" ON "message_threads" ("firmId");
CREATE INDEX IF NOT EXISTS "message_threads_desk_idx"   ON "message_threads" ("desk");

-- El `DEFAULT gen_random_uuid()` no lo conoce Prisma (que manda su cuid): está
-- para que un insert por REST que omita el id no muera — la trampa documentada
-- de `@default(cuid())`, que no existe en la base.
CREATE TABLE IF NOT EXISTS "message_desk_members" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "desk"          "message_desk" NOT NULL,
  "userId"        text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "addedByUserId" text,
  "addedByName"   text,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_desk_members_desk_userId_key" ON "message_desk_members" ("desk", "userId");
CREATE INDEX IF NOT EXISTS "message_desk_members_userId_idx" ON "message_desk_members" ("userId");
