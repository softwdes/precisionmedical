-- 20260819b — Encargados y adjusters a TEXTO LIBRE
--
-- El diseño anterior exigía que la persona existiera en un catálogo: el
-- encargado colgado del bufete del caso, el adjuster de la aseguradora. Si el
-- caso no tenía bufete o no tenía aseguradora, no se podía agregar a nadie — y
-- como el catálogo está vacío, en la práctica no se podía agregar NUNCA.
--
-- Decisión de Erick: que se escriba a mano y ya. El vínculo al catálogo se
-- conserva como opcional, así que cuando haya gente cargada se puede seguir
-- eligiendo y el dato queda linkeado; pero nunca vuelve a ser un requisito.

-- ── Encargados ──────────────────────────────────────────────────────────────
ALTER TABLE "case_managers" ALTER COLUMN "lawyerId" DROP NOT NULL;
ALTER TABLE "case_managers" ADD COLUMN IF NOT EXISTS "name"  TEXT;
ALTER TABLE "case_managers" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "case_managers" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "case_managers" ADD COLUMN IF NOT EXISTS "role"  TEXT;

-- El unique (caseId, lawyerId) no sirve con texto libre: dos personas escritas
-- a mano tienen lawyerId NULL y en Postgres NULL nunca choca con NULL, así que
-- el índice las deja pasar igual. Se conserva para los que SÍ vienen del
-- catálogo, que es donde tiene sentido evitar el duplicado.

-- ── Adjusters ───────────────────────────────────────────────────────────────
ALTER TABLE "case_adjusters" ALTER COLUMN "adjusterId" DROP NOT NULL;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "name"      TEXT;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "phone"     TEXT;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "extension" TEXT;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "phone2"    TEXT;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "fax"       TEXT;
ALTER TABLE "case_adjusters" ADD COLUMN IF NOT EXISTS "email"     TEXT;
