-- 20260819 — Quién agendó la cita (pedido de Edson)
--
-- `appointments` nunca guardó el autor. Edson necesita saber a quién preguntarle
-- por una cita.
--
-- El backfill sale del audit log: `CREATE_APPOINTMENT` guarda `entityId` con el
-- id de la cita y `actorUserId` con quien la creó. Recupera 79 de las citas que
-- pasaron por este sistema; las ~14.200 migradas del v2 quedan en NULL y así se
-- quedan — no hay a quién atribuirlas.

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "createdByName"   TEXT;

-- Backfill. Se toma el registro MÁS ANTIGUO por cita: si alguien reprogramó
-- después, el que la creó sigue siendo el primero.
UPDATE "appointments" a
SET "createdByUserId" = src."actorUserId",
    "createdByName"   = TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", '')))
FROM (
  SELECT DISTINCT ON (al."entityId") al."entityId", al."actorUserId"
  FROM "audit_logs" al
  WHERE al."action" = 'CREATE_APPOINTMENT' AND al."actorUserId" IS NOT NULL
  ORDER BY al."entityId", al."createdAt" ASC
) src
LEFT JOIN "users" u ON u."id" = src."actorUserId"
WHERE a."id" = src."entityId" AND a."createdByUserId" IS NULL;
