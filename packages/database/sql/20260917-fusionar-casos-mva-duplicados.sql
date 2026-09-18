-- ============================================================================
-- Fusionar los casos MVA que son el MISMO accidente cargado dos veces
-- ----------------------------------------------------------------------------
-- 2026-09-17 · pedido por Erick tras ver la vista de Edson
-- APLICADO en producción el 2026-09-17. Constancia: 12 filas en `audit_logs`
-- con action = 'MERGE_DUPLICATE_CASE'.
--
-- ┌─ POR QUÉ ESTE ARCHIVO NO USA TABLAS TEMPORALES ──────────────────────────┐
-- │ La primera versión armaba los pares en `CREATE TEMP TABLE … ON COMMIT    │
-- │ DROP`. Aplicó bien, pero el informe del final murió con                  │
-- │ «relation "_pares" does not exist»: el editor SQL de Supabase no sostiene │
-- │ una tabla temporal a lo largo de todo el script, y al llegar el COMMIT    │
-- │ el ON COMMIT DROP se la lleva antes de que se lea.                       │
-- │                                                                          │
-- │ Acá los pares van en un CTE `VALUES` y TODO el movimiento vive en UNA     │
-- │ sola sentencia: una sentencia es atómica por definición, así que no hace  │
-- │ falta BEGIN/COMMIT y no hay nada que el editor pueda cortar al medio.    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- 12 pares (24 casos). En 9 el número de claim es IDÉNTICO en los dos; en 2 los
-- casos se crearon el mismo día con códigos consecutivos (2223/2224, 2331/2332),
-- que es la huella de un doble envío del formulario.
--
-- QUÉ HACE: mueve todo lo que cuelga del caso duplicado al caso que tiene la
-- historia, y deja el duplicado marcado como borrado.
--
-- NO BORRA NADA. El absorbido queda entero en la base con `deletedAt` puesto:
-- si un par está mal elegido se revierte. Un DELETE real era imposible de
-- deshacer y además lo bloquean los FK RESTRICT de `lien_signatures` e
-- `intake_submissions`.
--
-- LO QUE NO SE MUEVE Y POR QUÉ
--   · case_consents — los 4 consentimientos existen en AMBOS casos con los
--     mismos códigos, y hay un único por (caseId, code): moverlos chocaría
--     siempre. Se quedan con el absorbido, que sigue siendo legible.
--   · case_auto_insurances — único por caseId y los dos casos tienen fila.
--     Medido: en los 10 pares que las tienen, claim, PIP, adjuster, teléfono,
--     aseguradora y comentarios son IDÉNTICOS. No se pierde un dato.
--
-- QUIÉN SOBREVIVE: el caso que tiene las citas, los cargos, el lien y los
-- documentos. El absorbido es, en todos los pares, el que casi solo tiene los 4
-- consentimientos del alta.
--
-- SE CORRE EN 3 PASOS, en este orden. Si el paso 1 aborta, no se sigue.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 1 — Guardas. Esto se midió el 2026-09-17; si la base cambió, aborta.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE n int; detalle text;
BEGIN
  WITH pares(sobrevive, absorbido) AS (VALUES
    ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
    ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
    ('MVA-3017','MVA-3329'), ('MVA-2685','MVA-2684'), ('MVA-1949','MVA-1976'),
    ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088'))
  SELECT COUNT(*) INTO n
  FROM pares p
  JOIN cases s ON s."caseCode" = p.sobrevive
  JOIN cases a ON a."caseCode" = p.absorbido;
  IF n <> 12 THEN
    RAISE EXCEPTION 'Se esperaban 12 pares y se resolvieron %. Algún caseCode ya no existe.', n;
  END IF;

  -- Mismo paciente, los dos MVA y ninguno borrado ya.
  WITH pares(sobrevive, absorbido) AS (VALUES
    ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
    ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
    ('MVA-3017','MVA-3329'), ('MVA-2685','MVA-2684'), ('MVA-1949','MVA-1976'),
    ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088'))
  SELECT string_agg(p.sobrevive || '/' || p.absorbido, ', ') INTO detalle
  FROM pares p
  JOIN cases s ON s."caseCode" = p.sobrevive
  JOIN cases a ON a."caseCode" = p.absorbido
  WHERE s."patientId" <> a."patientId"
     OR s."caseType" <> 'MVA' OR a."caseType" <> 'MVA'
     OR s."deletedAt" IS NOT NULL OR a."deletedAt" IS NOT NULL;
  IF detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Pares que ya no cumplen (distinto paciente, no-MVA, o YA FUSIONADOS): %', detalle;
  END IF;

  -- La misma fecha de accidente: es lo que los hace el mismo hecho. Perez queda
  -- afuera porque su fecha es un tipeo en los DOS casos (2028) y aun así
  -- comparten claim, que es evidencia más fuerte.
  WITH pares(sobrevive, absorbido) AS (VALUES
    ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
    ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
    ('MVA-3017','MVA-3329'), ('MVA-1949','MVA-1976'),
    ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088'))
  SELECT string_agg(p.sobrevive || '/' || p.absorbido, ', ') INTO detalle
  FROM pares p
  JOIN cases s ON s."caseCode" = p.sobrevive
  JOIN cases a ON a."caseCode" = p.absorbido
  LEFT JOIN case_auto_insurances cs ON cs."caseId" = s."id"
  LEFT JOIN case_auto_insurances ca ON ca."caseId" = a."id"
  WHERE COALESCE(cs."lossDate", s."accidentDate")::date
        IS DISTINCT FROM COALESCE(ca."lossDate", a."accidentDate")::date;
  IF detalle IS NOT NULL THEN
    RAISE EXCEPTION 'Pares que ya no comparten fecha de accidente: %', detalle;
  END IF;

  -- Mover las citas no puede chocar con el índice único
  -- (patientId, scheduledFor, providerId, caseId) WHERE status <> CANCELLED.
  WITH pares(sobrevive, absorbido) AS (VALUES
    ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
    ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
    ('MVA-3017','MVA-3329'), ('MVA-2685','MVA-2684'), ('MVA-1949','MVA-1976'),
    ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088')),
  f AS (SELECT s."id" AS rico, a."id" AS pobre FROM pares p
        JOIN cases s ON s."caseCode" = p.sobrevive
        JOIN cases a ON a."caseCode" = p.absorbido)
  SELECT COUNT(*) INTO n
  FROM f
  JOIN appointments ap ON ap."caseId" = f.pobre AND ap."status" <> 'CANCELLED'
  WHERE EXISTS (
    SELECT 1 FROM appointments ar
    WHERE ar."caseId" = f.rico AND ar."status" <> 'CANCELLED'
      AND ar."patientId"   = ap."patientId"
      AND ar."scheduledFor" = ap."scheduledFor"
      AND COALESCE(ar."providerId", '') = COALESCE(ap."providerId", ''));
  IF n > 0 THEN
    RAISE EXCEPTION '% cita(s) chocarían al moverse. Se midió 0 el 2026-09-17.', n;
  END IF;

  RAISE NOTICE 'Guardas OK: 12 pares listos para fusionar.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 2 — La fusión. UNA sola sentencia, así que es atómica: o entra todo o
--          no entra nada, sin depender de cómo el editor maneje transacciones.
-- ════════════════════════════════════════════════════════════════════════════
WITH pares(sobrevive, absorbido) AS (VALUES
  ('MVA-1404','MVA-2736'),  -- Dean, Melissa          acc 2025-01-06  claim 0780565016 en los dos
  ('MVA-2224','MVA-2223'),  -- Gonzalez, Enrique      acc 2026-01-03  mismo día, códigos seguidos
  ('MVA-419', 'MVA-2967'),  -- Johnson, Ryan          acc 2024-12-16  claim 0 en los dos
  ('MVA-1406','MVA-1739'),  -- Larson, Brynn          acc 2025-09-02  claim 0881840 en los dos
  ('MVA-2332','MVA-2331'),  -- Longo, Miguel Eduardo  acc 2025-12-30  mismo día, códigos seguidos
  ('MVA-2429','MVA-3196'),  -- Mantilla, Emilia       acc 2026-02-06  claim 4496K200B en los dos
  ('MVA-3017','MVA-3329'),  -- Palencia, Ariana       acc 2026-06-07  claim 0829685105 en los dos
  ('MVA-2685','MVA-2684'),  -- Perez, Jorge           claim 0814674248; la fecha (2028) es tipeo en AMBOS
  ('MVA-1949','MVA-1976'),  -- Reid, Nick             acc 2025-10-28
  ('MVA-2878','MVA-3071'),  -- Reynoso Nunez, Gabriel acc 2026-04-27  claim 0901428 en los dos
  ('MVA-1830','MVA-3311'),  -- Sanchez, Karlee        acc 2025-11-04  claim 2596647999 en los dos
  ('MVA-2340','MVA-3088')   -- Williams, Jahari       acc 2026-01-28  claim 26-631199170 en los dos
),
f AS (
  SELECT p.sobrevive, p.absorbido, s."id" AS rico, a."id" AS pobre
  FROM pares p
  JOIN cases s ON s."caseCode" = p.sobrevive
  JOIN cases a ON a."caseCode" = p.absorbido
  WHERE a."deletedAt" IS NULL          -- no rehace lo ya fusionado
),

-- Lo que se mueve sin restricción. Las citas se llevan puesta su facturación y
-- sus notas de visita, que cuelgan de la cita y no del caso.
m_citas AS (UPDATE appointments        t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_docs  AS (UPDATE patient_documents   t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_nota  AS (UPDATE case_notes          t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_ntrk  AS (UPDATE case_tracking_notes t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_mlog  AS (UPDATE message_logs        t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_hilo  AS (UPDATE message_threads     t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_call  AS (UPDATE call_logs           t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
m_dep   AS (UPDATE authorized_dependents t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),
-- El lien firmado es un documento histórico: si los dos casos tienen uno, se
-- quedan los dos. No hay único por caso, así que no choca.
m_lien  AS (UPDATE lien_signatures     t SET "caseId" = f.rico FROM f WHERE t."caseId" = f.pobre RETURNING 1),

-- Lo que se mueve solo si no choca con su índice único.
m_mgr AS (
  UPDATE case_managers t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM case_managers x
                     WHERE x."caseId" = f.rico AND x."lawyerId" = t."lawyerId")
  RETURNING 1),
m_asis AS (
  UPDATE case_legal_assistants t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM case_legal_assistants x
                     WHERE x."caseId" = f.rico AND x."lawyerId" = t."lawyerId")
  RETURNING 1),
m_adj AS (
  UPDATE case_adjusters t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM case_adjusters x
                     WHERE x."caseId" = f.rico
                       AND x."adjusterId" IS NOT DISTINCT FROM t."adjusterId")
  RETURNING 1),

-- Tablas con único por caseId: solo si el sobreviviente no tiene ya la suya.
m_trk AS (
  UPDATE case_tracking t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM case_tracking x WHERE x."caseId" = f.rico)
  RETURNING 1),
m_int AS (
  UPDATE intake_submissions t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM intake_submissions x WHERE x."caseId" = f.rico)
  RETURNING 1),
m_seg AS (
  UPDATE case_auto_insurances t SET "caseId" = f.rico FROM f
   WHERE t."caseId" = f.pobre
     AND NOT EXISTS (SELECT 1 FROM case_auto_insurances x WHERE x."caseId" = f.rico)
  RETURNING 1),

-- El duplicado queda marcado como borrado. No se borra.
m_caso AS (
  UPDATE cases c SET "deletedAt" = NOW()
  FROM f WHERE c."id" = f.pobre AND c."deletedAt" IS NULL
  RETURNING 1),

-- Constancia de quién movió qué. `id` no tiene default en la base (el schema se
-- aplicó con db push y @default(cuid()) es del cliente de Prisma): hay que darlo.
m_audit AS (
  INSERT INTO audit_logs ("id", "actorType", "action", "entityType", "entityId",
                          "before", "after", "metadata", "createdAt")
  SELECT gen_random_uuid()::text, 'SYSTEM', 'MERGE_DUPLICATE_CASE', 'Case', f.pobre,
         jsonb_build_object('caseCode', f.absorbido, 'deletedAt', NULL),
         jsonb_build_object('caseCode', f.absorbido, 'mergedInto', f.rico),
         jsonb_build_object(
           'motivo',    'mismo accidente cargado dos veces',
           'sobrevive', f.sobrevive,
           'absorbido', f.absorbido,
           'archivo',   '20260917-fusionar-casos-mva-duplicados.sql'),
         NOW()
  FROM f
  RETURNING 1)

SELECT
  (SELECT COUNT(*)::int FROM f)       AS pares_procesados,
  (SELECT COUNT(*)::int FROM m_citas) AS citas_movidas,
  (SELECT COUNT(*)::int FROM m_docs)  AS documentos_movidos,
  (SELECT COUNT(*)::int FROM m_lien)  AS liens_movidos,
  (SELECT COUNT(*)::int FROM m_dep)   AS dependientes_movidos,
  (SELECT COUNT(*)::int FROM m_seg)   AS seguros_movidos,
  (SELECT COUNT(*)::int FROM m_trk)   AS tracking_movidos,
  (SELECT COUNT(*)::int FROM m_caso)  AS duplicados_archivados,
  (SELECT COUNT(*)::int FROM m_audit) AS constancias;


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 3 — Verificación. Va aparte a propósito: dentro de la sentencia de
--          arriba leería la foto ANTERIOR (los CTE no se ven entre sí).
-- ════════════════════════════════════════════════════════════════════════════
WITH pares(sobrevive, absorbido) AS (VALUES
  ('MVA-1404','MVA-2736'), ('MVA-2224','MVA-2223'), ('MVA-419','MVA-2967'),
  ('MVA-1406','MVA-1739'), ('MVA-2332','MVA-2331'), ('MVA-2429','MVA-3196'),
  ('MVA-3017','MVA-3329'), ('MVA-2685','MVA-2684'), ('MVA-1949','MVA-1976'),
  ('MVA-2878','MVA-3071'), ('MVA-1830','MVA-3311'), ('MVA-2340','MVA-3088'))
SELECT p.sobrevive, p.absorbido,
       a."deletedAt" IS NOT NULL                                                   AS duplicado_archivado,
       (SELECT COUNT(*)::int FROM appointments      x WHERE x."caseId" = s."id")   AS citas_finales,
       (SELECT COUNT(*)::int FROM patient_documents x WHERE x."caseId" = s."id")   AS docs_finales,
       (SELECT COUNT(*)::int FROM lien_signatures   x WHERE x."caseId" = s."id")   AS liens_finales,
       (SELECT COUNT(*)::int FROM appointments      x WHERE x."caseId" = a."id")   AS citas_colgadas,
       (SELECT COUNT(*)::int FROM patient_documents x WHERE x."caseId" = a."id")   AS docs_colgados,
       (SELECT COUNT(*)::int FROM case_consents     x WHERE x."caseId" = a."id")   AS consents_que_se_quedan
FROM pares p
JOIN cases s ON s."caseCode" = p.sobrevive
JOIN cases a ON a."caseCode" = p.absorbido
ORDER BY p.sobrevive;
