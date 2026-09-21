-- Cobrar antes de atender — la marca roja del v2 (Erick, 2026-09-20)
--
-- En el v2 esto era texto libre arriba de la ficha del paciente:
--   "GP 25 CP// Not to be seen w/out sizable pymt on bal 9/14 ..."
--
-- Es una marca de CRITERIO, no un saldo calculado. Hace falta porque el saldo
-- por sí solo no sirve para frenar una atención: de $1.377.546 de deuda en la
-- base, $1.377.371 son del seguro o del abogado y $164,81 son del mostrador
-- (medido el 2026-09-16). Disparar por el número le pediría al paciente de MVA
-- la plata que debe su bufete.
--
-- Cuatro columnas, todas nullable o con default: no reescribe ninguna fila
-- existente y es seguro de correr con la app arriba.
--
-- Aplicar con:  node scripts/apply-sql.cjs prisma/sql/20260920-cobrar-antes-de-atender.sql

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "collectBeforeVisit"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "collectBeforeVisitNote" TEXT,
  ADD COLUMN IF NOT EXISTS "collectBeforeVisitBy"   TEXT,
  ADD COLUMN IF NOT EXISTS "collectBeforeVisitAt"   TIMESTAMP(3);

-- El índice es PARCIAL a propósito.
--
-- La consulta del saludo pregunta "¿cuál de ESTOS pacientes que vienen hoy está
-- marcado?", y los marcados van a ser un puñado sobre miles de filas. Un índice
-- sobre toda la columna indexaría ~5.700 `false` para no leer ninguno.
CREATE INDEX IF NOT EXISTS "patients_collect_before_visit_idx"
  ON "patients" ("collectBeforeVisit")
  WHERE "collectBeforeVisit" = TRUE;
