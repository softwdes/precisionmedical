-- ============================================================================
-- Devolver a MVA los tres casos que Edson reporta como ausentes del tracking
--
--   GM-3407  Quinn Johnson
--   GM-3408  Taylor Catmull
--   GM-3356  Alexander Day
--
-- APLICADO el 2026-10-01 contra produccion. Es idempotente: la guarda es
-- `caseType = 'GENERAL'` sobre esos tres codigos, asi que corrido de nuevo no
-- hace nada. Se deja para dejar constancia y por si hay que repetirlo.
--
-- ── Que paso ────────────────────────────────────────────────────────────────
--
-- Los tres NACIERON MVA el 21-sep (los creo Reagin Collyer desde una llamada de
-- quiropractico, con The Advocates como bufete). El 22-sep entre las 13:35 y
-- las 13:51 Erick los paso a GENERAL, a pedido de Edson, que en ese momento
-- dijo que no eran MVA sino medicina general. El sistema hizo exactamente lo
-- que se le pidio: cambio el tipo, renombro MVA-3407 -> GM-3407 y retipo las
-- citas AUTO_ACCIDENT -> FAMILY_PRACTICE.
--
-- La vista de seguimiento de Edson filtra `caseType = 'MVA'` y el filtro "Mark"
-- del calendario usa el mismo campo. Por eso desaparecieron de los dos lugares
-- a la vez: una sola causa, no dos fallas.
--
-- Esto revierte las TRES cosas que cambio el retipado. Revertir solo el tipo
-- dejaria el codigo diciendo GM y las citas diciendo "Family Practice" en Day
-- Admission.
--
-- ── Por que un solo statement y no una tabla temporal ───────────────────────
--
-- La primera version usaba `CREATE TEMP TABLE ... ON COMMIT DROP` y el editor
-- SQL de Supabase la volteo: los UPDATE corrieron y commitearon, pero para
-- cuando llegaba el SELECT final de verificacion la temporal ya no existia y
-- salia `42P01: relation "objetivo" does not exist`. O sea, el trabajo se hizo
-- y el reporte fallo — lo peor de los dos mundos, porque parece que no corrio.
--
-- Un UPDATE/INSERT encadenado con CTEs es UN statement, y un statement es
-- atomico por definicion: no necesita BEGIN/COMMIT ni sobrevivir entre
-- statements. Todas las CTEs ven la MISMA foto inicial, asi que la
-- anticolision del codigo y el retipado de citas no se pisan entre si.
--
-- ── Guardas ─────────────────────────────────────────────────────────────────
--
-- 1. Solo los tres codigos nombrados, y solo si hoy son GENERAL.
-- 2. El renombre respeta la anticolision de la ruta PATCH: si MVA-3407 ya
--    existiera, el codigo NO se toca (el numero es unico y global, el prefijo
--    es solo etiqueta). Medido el 2026-10-01: los tres destinos estaban libres.
-- 3. Solo retipa citas que hoy son FAMILY_PRACTICE. Los otros tipos del enum
--    —FOLLOW_UP, URGENT_CARE, CONSULTATION— describen QUE ES la visita, no de
--    que es el caso: pisarlos perderia el dato sin forma de recuperarlo.
-- 4. Deja audit log, como exige la Regla #3.
-- ============================================================================

WITH objetivo AS (
  SELECT c."id",
         c."caseCode"                         AS codigo_viejo,
         replace(c."caseCode", 'GM-', 'MVA-') AS codigo_nuevo
    FROM cases c
   WHERE c."caseCode" IN ('GM-3407', 'GM-3408', 'GM-3356')
     AND c."caseType" = 'GENERAL'
     AND c."deletedAt" IS NULL
),
-- El destino puede estar ocupado: en el rango legado del v2 conviven MVA-2900 y
-- CASE-2900. Si lo esta, se cambia el tipo igual y el codigo queda como estaba.
plan AS (
  SELECT o.*,
         NOT EXISTS (SELECT 1 FROM cases x WHERE x."caseCode" = o.codigo_nuevo) AS renombrar
    FROM objetivo o
),
casos AS (
  UPDATE cases c
     SET "caseType"  = 'MVA',
         "caseCode"  = CASE WHEN p.renombrar THEN p.codigo_nuevo ELSE c."caseCode" END,
         "updatedAt" = now()
    FROM plan p
   WHERE c."id" = p."id"
  RETURNING c."id", c."caseCode"
),
citas AS (
  UPDATE appointments a
     SET "type"      = 'AUTO_ACCIDENT',
         "updatedAt" = now()
    FROM plan p
   WHERE a."caseId"   = p."id"
     AND a."deletedAt" IS NULL
     AND a."type"     = 'FAMILY_PRACTICE'
  RETURNING a."id", a."caseId"
),
auditoria AS (
  INSERT INTO audit_logs ("id", "actorType", "action", "entityType", "entityId",
                          "metadata", "createdAt")
  SELECT gen_random_uuid()::text,
         'SYSTEM',
         'RETYPE_CASE_APPOINTMENTS',
         'cases',
         p."id",
         jsonb_build_object(
           'caseCode',         CASE WHEN p.renombrar THEN p.codigo_nuevo ELSE p.codigo_viejo END,
           'previousCaseCode', p.codigo_viejo,
           'caseType',         'MVA',
           'de',               'FAMILY_PRACTICE',
           'a',                'AUTO_ACCIDENT',
           'motivo',           'Edson pidio devolverlos a MVA: el 22-sep se habian pasado a GENERAL a pedido suyo, y eso los saco del tracking y del filtro Mark del calendario',
           'origen',           '20261001-devolver-tres-casos-a-mva.sql'
         ),
         now()
    FROM plan p
  RETURNING "id"
)
SELECT (SELECT count(*) FROM casos)     AS casos_devueltos_a_mva,
       (SELECT count(*) FROM citas)     AS citas_retipadas,
       (SELECT count(*) FROM auditoria) AS filas_de_audit;

-- ── Verificacion, aparte: lee lo que quedo commiteado ───────────────────────
-- Esperado: tres filas MVA-3356 / MVA-3407 / MVA-3408, tipo MVA, y cero citas
-- en FAMILY_PRACTICE.
SELECT c."caseCode",
       p."lastName" || ', ' || p."firstName" AS paciente,
       c."caseType"::text                    AS tipo,
       count(*) FILTER (WHERE a."type" = 'AUTO_ACCIDENT')  AS citas_auto_accident,
       count(*) FILTER (WHERE a."type" = 'FAMILY_PRACTICE') AS citas_family_practice
  FROM cases c
  JOIN patients p     ON p."id" = c."patientId"
  LEFT JOIN appointments a ON a."caseId" = c."id" AND a."deletedAt" IS NULL
 WHERE c."caseCode" IN ('MVA-3407', 'MVA-3408', 'MVA-3356',
                        'GM-3407',  'GM-3408',  'GM-3356')
 GROUP BY c."caseCode", paciente, c."caseType"
 ORDER BY c."caseCode";
