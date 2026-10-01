-- ============================================================================
-- Quinn Johnson y Taylor Catmull SI son MVA nuevos
--
--   MVA-3407  Quinn Johnson
--   MVA-3408  Taylor Catmull
--
-- Corrige a 20261001-quinn-y-taylor-no-son-primera-visita, del mismo dia.
--
-- ── El ida y vuelta, completo, para que no se repita ────────────────────────
--
-- 1. 21-sep: Reagin Collyer los da de alta como MVA, con The Advocates.
-- 2. Edson avisa que no son MVA nuevos.
-- 3. 22-sep: se los pasa a GENERAL. Era la unica palanca que existia entonces
--    para sacarlos de la lista de nuevos, y resulto demasiado gruesa: los saco
--    del tracking ENTERO y del filtro "Mark" del calendario, porque los dos
--    leen `caseType`.
-- 4. 01-oct: Edson reporta que no los encuentra. Se revierten a MVA
--    (20261001-devolver-tres-casos-a-mva) y se marcan como control recurrente
--    con la herramienta correcta, que existe desde el 28-sep.
-- 5. 01-oct, despues: Edson corrige — **los dos SI son MVA nuevos.**
-- 6. Esto.
--
-- ── Por que `false` y no volver a NULL ──────────────────────────────────────
--
-- `followUpOverride` es nullable con tres estados a proposito:
--   NULL  = nadie lo reviso, vale la pista de `appointments.notes`
--   true  = es un control recurrente
--   false = **revisado, y SI es primera visita, aunque la nota diga otra cosa**
--
-- Hoy los dos valores se comportarian IGUAL, y lo verifique en vez de
-- suponerlo:
--   · `YA_VENIA_EN_TRATAMIENTO` es `COALESCE(followUpOverride, prev IS NOT NULL)`
--     y ese `prev` solo mira OTROS casos del mismo paciente por el mismo
--     accidente (`c2."id" <> c."id"`). Estos dos tienen un solo caso cada uno,
--     asi que `prev` va a ser NULL siempre: con NULL caerian igual en "nuevo".
--   · La etiqueta del cliente es `followUpOverride ?? noteHintsFollowUp`, y las
--     notas de las dos citas NO disparan la pista: dicen "NEW MVA AXCESS
--     REFERRAL...", sin "F/U" ni "follow up". Medido el 2026-10-01.
--
-- Se escribe `false` igual porque es el unico de los dos que GUARDA que Edson
-- lo reviso, y porque no depende de que la nota siga diciendo lo mismo: si
-- manana alguien le agrega "F/U 2 weeks" al texto, con NULL la fila volveria a
-- sugerir control y con `false` no se mueve.
--
-- ── Donde van a aparecer ────────────────────────────────────────────────────
--
-- Vuelven a la pestana **Tracking** (la de MVA nuevos) y salen de "Already in
-- treatment". Los contadores vuelven de 108/5/0 a 110/3/0. Y vuelven a contar
-- en el filtro "Mark" del calendario, que es lo que Edson pidio.
--
-- Alexander Day (MVA-3356) sigue sin tocarse: nunca se lo marco.
--
-- Idempotente.
-- ============================================================================

WITH objetivo AS (
  SELECT c."id" AS caso
    FROM cases c
   WHERE c."caseCode" IN ('MVA-3407', 'MVA-3408')
     AND c."caseType" = 'MVA'
     AND c."deletedAt" IS NULL
),
marca AS (
  INSERT INTO case_tracking ("id", "caseId", "followUpOverride", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, o.caso, false, now(), now()
    FROM objetivo o
  ON CONFLICT ("caseId") DO UPDATE
     SET "followUpOverride" = false,
         "updatedAt"        = now()
  RETURNING "caseId"
),
auditoria AS (
  INSERT INTO audit_logs ("id", "actorType", "action", "entityType", "entityId",
                          "metadata", "createdAt")
  SELECT gen_random_uuid()::text,
         'SYSTEM',
         'SET_FOLLOW_UP_OVERRIDE',
         'cases',
         m."caseId",
         jsonb_build_object(
           'followUpOverride', false,
           'motivo',           'Edson corrige: Quinn Johnson y Taylor Catmull SI son MVA nuevos. Se revierte la marca de control recurrente puesta mas temprano el mismo dia. false y no NULL para dejar constancia de que fue revisado.',
           'origen',           '20261001b-quinn-y-taylor-si-son-new-mva.sql'
         ),
         now()
    FROM marca m
  RETURNING "id"
)
SELECT (SELECT count(*) FROM marca)     AS casos_corregidos,
       (SELECT count(*) FROM auditoria) AS filas_de_audit;

-- ── Verificacion, aparte: lee lo commiteado ─────────────────────────────────
-- Esperado: Quinn y Taylor en false (MVA nuevos), Day sigue en NULL, los tres MVA.
SELECT c."caseCode",
       p."lastName" || ', ' || p."firstName" AS paciente,
       c."caseType"::text                    AS tipo,
       ct."followUpOverride"                 AS marca,
       CASE
         WHEN ct."followUpOverride" IS FALSE THEN 'MVA nuevo (revisado)'
         WHEN ct."followUpOverride" IS TRUE  THEN 'control recurrente'
         ELSE 'sin revisar'
       END                                   AS significa
  FROM cases c
  JOIN patients p            ON p."id" = c."patientId"
  LEFT JOIN case_tracking ct ON ct."caseId" = c."id"
 WHERE c."caseCode" IN ('MVA-3407', 'MVA-3408', 'MVA-3356')
 ORDER BY c."caseCode";
