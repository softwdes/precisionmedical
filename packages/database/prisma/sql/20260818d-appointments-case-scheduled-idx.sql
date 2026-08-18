-- 20260818d — Índice para la grilla de Edson (paso 5)
--
-- La grilla saca "la primera cita del caso" con un JOIN LATERAL:
--   SELECT ... FROM appointments WHERE "caseId" = c.id ORDER BY "scheduledFor" LIMIT 1
--
-- Con los índices sueltos (`caseId` por un lado, `scheduledFor` por otro) Postgres
-- filtra por caso y después ORDENA — 7098 buffers para 1004 casos. El compuesto
-- deja el LIMIT 1 en una lectura directa del índice, sin sort.
CREATE INDEX IF NOT EXISTS "appointments_caseId_scheduledFor_idx"
  ON "appointments" ("caseId", "scheduledFor");
