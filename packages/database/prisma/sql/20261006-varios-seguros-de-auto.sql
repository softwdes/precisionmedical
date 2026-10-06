-- Un caso puede tener VARIOS seguros de auto.
--
-- ── Por qué ────────────────────────────────────────────────────────────────
--
-- `case_auto_insurances.caseId` era UNIQUE —uno por caso— y el guardado hacía
-- `upsert`, así que cargar un segundo seguro de auto **reemplazaba al primero
-- en silencio**. Reportado el 2026-10-06.
--
-- Y en un accidente son dos de verdad: el del paciente y el del tercero que lo
-- chocó, cada uno con su póliza, su número de reclamo y su ajustador. Decisión
-- de Erick, 2026-10-06: que quepan los dos, o más.
--
-- ── ⚠️ EN QUÉ PROYECTO ─────────────────────────────────────────────────────
--
--     kiqlhwncfqfftaqqvadj        ← ESTE, el de la clínica (Phoenix)
--     ztyahz…                      ← el de Admin, NO
--
-- Para confirmar dónde estás parado, antes de nada:
--
--     SELECT count(*) FROM case_auto_insurances;   -- tiene que responder 273
--
-- ── ⚠️ ORDEN CON EL DEPLOY ─────────────────────────────────────────────────
--
-- **Esto va PRIMERO, el código después.** Son compatibles en ese orden: quitar
-- el UNIQUE no rompe nada de lo que está corriendo —el código viejo sigue
-- guardando un solo seguro por caso—, mientras que subir el código nuevo antes
-- de la migración haría fallar el alta del segundo con un error de constraint.
--
-- ── Qué hace ───────────────────────────────────────────────────────────────
--
-- Quita el UNIQUE y deja un índice normal en su lugar: las consultas siguen
-- buscando por `caseId` todo el tiempo y sin índice pasarían a recorrer la
-- tabla entera.
--
-- No toca una sola fila de datos. Es reversible mientras ningún caso tenga dos.

-- ── 1. Control, ANTES ──────────────────────────────────────────────────────
SELECT
  count(*)                      AS filas,
  count(DISTINCT "caseId")      AS casos_distintos,
  count(*) - count(DISTINCT "caseId") AS casos_con_mas_de_uno
FROM case_auto_insurances;
-- Hoy: 273 / 273 / 0

-- ── 2. El cambio ───────────────────────────────────────────────────────────
--
-- ⚠️ Es un ÍNDICE ÚNICO, no un CONSTRAINT. Verificado en la base el 2026-10-06:
--
--     pg_constraint (contype='u')  →  vacío
--     pg_indexes                   →  CREATE UNIQUE INDEX "case_auto_insurances_caseId_key"
--
-- Un `ALTER TABLE … DROP CONSTRAINT IF EXISTS` habría corrido sin error y **sin
-- hacer nada**: el `IF EXISTS` se traga el caso y la restricción seguiría viva.
-- Por eso va `DROP INDEX`.
DROP INDEX IF EXISTS "case_auto_insurances_caseId_key";

CREATE INDEX IF NOT EXISTS "case_auto_insurances_caseId_idx"
  ON case_auto_insurances ("caseId");

-- ── 3. Control, DESPUÉS ────────────────────────────────────────────────────
-- El índice único tiene que haber desaparecido y el normal tiene que estar.
SELECT
  (SELECT count(*) FROM pg_indexes
    WHERE tablename = 'case_auto_insurances'
      AND indexname = 'case_auto_insurances_caseId_key') AS unico_restante,
  (SELECT count(*) FROM pg_indexes
    WHERE tablename = 'case_auto_insurances'
      AND indexname = 'case_auto_insurances_caseId_idx') AS indice_creado;
-- Esperado: 0 · 1
