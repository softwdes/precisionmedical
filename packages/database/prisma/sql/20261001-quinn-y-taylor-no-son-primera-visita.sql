-- ============================================================================
-- Quinn Johnson y Taylor Catmull: son MVA, pero NO son primera visita
--
--   MVA-3407  Quinn Johnson
--   MVA-3408  Taylor Catmull
--
-- ── Que paso, en orden ──────────────────────────────────────────────────────
--
-- 1. 21-sep: Reagin Collyer los da de alta como MVA, con The Advocates.
-- 2. Edson avisa que no son MVA NUEVOS. Tiene razon: son MVA, pero la cita no
--    es una primera visita.
-- 3. 22-sep: se los pasa a GENERAL. **Ese fue el error.** Era el unico boton
--    que en ese momento los sacaba de la lista de MVA nuevos — la opcion
--    "MVA F/U" se construyo recien el 28-sep (ver 20260928-visita-recurrente)
--    y no existia todavia. Pasarlos a GM los saco del tracking ENTERO y del
--    filtro "Mark" del calendario, no solo de la lista de nuevos.
-- 4. 01-oct: se revierten a MVA (ver 20261001-devolver-tres-casos-a-mva).
-- 5. Esto, que es la correccion que correspondia desde el principio.
--
-- ── Por que `followUpOverride` y no tocar el tipo ───────────────────────────
--
-- El tipo del caso responde "¿de que es este expediente?" (un accidente) y el
-- `visitNumber` responde "¿es la primera vez que viene por este accidente?".
-- Son dos preguntas distintas y el 22-sep se contesto la segunda cambiando la
-- primera. Por eso desaparecieron de lugares que nadie queria tocar.
--
-- `case_tracking.followUpOverride` es NULLABLE con tres estados a proposito:
--   NULL  = nadie lo reviso, vale la pista de `appointments.notes`
--   true  = Edson dice que es un control recurrente  <-- lo que se escribe aca
--   false = Edson dice que SI es primera visita, aunque la nota diga otra cosa
--
-- `appointments/route.ts` lo lee y fuerza `visitNumber >= 1`, que es lo que
-- apaga el 🆕 del calendario y la etiqueta "1st visit" del tracking. El caso
-- sigue siendo MVA y sigue en la vista de Edson, que es todo el punto.
--
-- ── De aca en mas no hace falta SQL ─────────────────────────────────────────
--
-- Edson puede hacer esto solo, desde la columna **Type** de su grilla: la
-- opcion "MVA F/U". Este script existe solo porque estos dos venian de la
-- correccion equivocada del 22-sep.
--
-- ── Alcance ─────────────────────────────────────────────────────────────────
--
-- SOLO estos dos. Alexander Day (MVA-3356) se retipo el mismo dia pero Edson
-- NO lo marco, y sus citas dicen que su visita del 17-sep si fue la primera
-- (es la mas antigua que tiene). Queda sin tocar hasta que el lo confirme.
--
-- Idempotente: corrido dos veces deja el mismo `true`.
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
  SELECT gen_random_uuid()::text, o.caso, true, now(), now()
    FROM objetivo o
  ON CONFLICT ("caseId") DO UPDATE
     SET "followUpOverride" = true,
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
           'followUpOverride', true,
           'motivo',           'Edson marco estas citas como NOT new MVA. El 22-sep se habia resuelto pasando el caso a GENERAL, que los saco del tracking entero. La correccion que corresponde es marcarlos como control recurrente y dejarlos en MVA.',
           'origen',           '20261001-quinn-y-taylor-no-son-primera-visita.sql'
         ),
         now()
    FROM marca m
  RETURNING "id"
)
SELECT (SELECT count(*) FROM marca)     AS casos_marcados,
       (SELECT count(*) FROM auditoria) AS filas_de_audit;

-- ── Verificacion, aparte: lee lo commiteado ─────────────────────────────────
-- Esperado: las dos filas con followUpOverride = true y caseType = MVA.
SELECT c."caseCode",
       p."lastName" || ', ' || p."firstName" AS paciente,
       c."caseType"::text                    AS tipo,
       ct."followUpOverride"                 AS marcado_como_control
  FROM cases c
  JOIN patients p            ON p."id" = c."patientId"
  LEFT JOIN case_tracking ct ON ct."caseId" = c."id"
 WHERE c."caseCode" IN ('MVA-3407', 'MVA-3408', 'MVA-3356')
 ORDER BY c."caseCode";
