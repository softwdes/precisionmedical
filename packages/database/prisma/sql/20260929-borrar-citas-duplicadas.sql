-- 20260929 — Borrar las dos citas duplicadas del 22 de septiembre
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Edson reporta desde hace días que la hora del Seguimiento no coincide con la
-- del calendario. Tiene razón, y NO es un problema de zona horaria ni de la
-- consulta: son DOS CITAS distintas para el mismo paciente el mismo día.
--
--   Oropeza Prezo, Gabriela   16:00 David Miller   ← sobra
--                             17:00 Barry Clanton  ← la buena, la que ve él
--   Perozo Oropeza, Danna     16:30 David Miller   ← sobra
--                             17:30 Barry Clanton  ← la buena
--
-- El Seguimiento muestra la PRIMERA cita del caso, que es la razón de ser de esa
-- vista, y la primera es la duplicada. Edson marcó las dos en su pantalla:
-- "STILL WRONG TIME, CORRECT IS 5pm" y "CORRECT IS 5:30 PM".
--
-- ── Cómo nacieron ───────────────────────────────────────────────────────────
--
-- El 16-sep alguien agendó a los tres hermanos con Barry Clanton (19:37-19:39) y
-- una hora después los volvió a agendar con David Miller, una hora más temprano
-- (20:45-20:46). De las tres duplicadas sólo se borró la de Ochoa; estas dos
-- quedaron vivas.
--
-- ── Por qué no lo arregla el código ─────────────────────────────────────────
--
-- Lo intenté y no se puede. La cita BUENA se creó PRIMERO y la duplicada
-- DESPUÉS, así que "la más nueva gana" elegiría la equivocada; y la duplicada es
-- la más temprana del día, así que la regla actual también falla. No hay nada en
-- el dato que diga cuál sobra: lo sabe una persona, no una consulta.
--
-- Lo que SÍ va por código es que no vuelva a pasar: el único control al agendar
-- mira solapamientos del PROVIDER, y nadie chequea si el PACIENTE ya tiene una
-- cita ese día. Por eso nacieron sin un solo aviso.
--
-- ── Lo que este script NO borra, a propósito ────────────────────────────────
--
-- Hay un TERCER par con la misma forma: Ngarupe, Metua (29-ene-2025), 16:30
-- David Miller vs 17:00 Barry Clanton. Queda afuera por dos motivos medidos:
--
--   · Las dos se crearon en el MISMO SEGUNDO (2025-08-05 21:16) — es un
--     artefacto de la migración del v2, no una doble reserva de recepción.
--   · La de las 16:30 tiene un cargo colgando: "No show appointment", $45,
--     balanceDue 45, SIN pagar. Borrarla deja esa plata sin cita.
--
-- Si alguien decide limpiarla, primero hay que resolver el cargo. No se mezcla
-- con esto.
--
-- ── Reversible ──────────────────────────────────────────────────────────────
--
-- Es borrado LÓGICO. Para deshacerlo:
--   UPDATE appointments SET "deletedAt" = NULL, "deletedById" = NULL,
--          "deletedByName" = NULL, "deleteReason" = NULL
--    WHERE id IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr');
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20260929-borrar-citas-duplicadas.sql

BEGIN;

-- ── Guarda 1: que sean exactamente las dos que creo que son ─────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
    FROM appointments a
   WHERE a."id" IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr')
     AND a."deletedAt" IS NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Esperaba 2 citas vivas con esos ids y encontré %. Alguien ya las tocó: revisar antes de seguir.', n;
  END IF;
END $$;

-- ── Guarda 2: que NO tengan plata ni nota colgando ──────────────────────────
-- Es la lección de la fusión de casos del 17-sep: lo que se borra sin mirar qué
-- cuelga deja huérfano lo que no se ve.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
    FROM appointment_billing ab
   WHERE ab."appointmentId" IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr');
  IF n <> 0 THEN
    RAISE EXCEPTION 'Estas citas tienen % cargo(s). NO se borran hasta resolverlos.', n;
  END IF;

  SELECT COUNT(*) INTO n
    FROM visit_notes vn
   WHERE vn."appointmentId" IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr');
  IF n <> 0 THEN
    RAISE EXCEPTION 'Estas citas tienen % nota(s) de visita. NO se borran.', n;
  END IF;
END $$;

-- ── Guarda 3: que la cita BUENA siga viva ───────────────────────────────────
-- Borrar la duplicada sin que exista la otra deja al paciente sin ninguna cita,
-- que es peor que el problema original.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
    FROM appointments a
    JOIN cases c ON c."id" = a."caseId"
    JOIN patients p ON p."id" = c."patientId"
   WHERE a."deletedAt" IS NULL
     AND (a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date = DATE '2026-09-22'
     AND (p."lastName" ILIKE '%Oropeza Prezo%' OR p."lastName" ILIKE '%Perozo%')
     AND to_char(a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver', 'HH24:MI') IN ('17:00', '17:30');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Esperaba las 2 citas buenas (17:00 y 17:30) vivas y encontré %. No se borra nada.', n;
  END IF;
END $$;

-- ── El borrado ──────────────────────────────────────────────────────────────
UPDATE appointments
   SET "deletedAt"     = NOW(),
       "deletedByName" = 'Erick Salinas (SQL)',
       "deleteReason"  = 'Duplicada: el mismo paciente quedó agendado dos veces el 22-sep. La cita válida es la de Barry Clanton una hora más tarde. Reportado por Edson.'
 WHERE "id" IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr')
   AND "deletedAt" IS NULL;

-- ── Constancia ──────────────────────────────────────────────────────────────
-- Una fila por cita: el audit se lee por entidad, y un solo registro con las dos
-- adentro no aparece al buscar el historial de una de ellas.
INSERT INTO audit_logs ("id", "actorType", "actorRole", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'adl_dup_' || substr(md5(a."id" || '20260929'), 1, 20),
  'SYSTEM',
  'SUPER_ADMIN',
  'SOFT_DELETE_DUPLICATE_APPOINTMENT',
  'appointments',
  a."id",
  jsonb_build_object(
    'motivo',      'cita duplicada el mismo dia, reportada por Edson',
    'sql',         '20260929-borrar-citas-duplicadas',
    'scheduledFor', to_char(a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver', 'YYYY-MM-DD HH24:MI'),
    'caseId',      a."caseId"
  ),
  NOW()
FROM appointments a
WHERE a."id" IN ('cmu4km3d10001ny6b4s084gv3', 'cmu4klhim0001hjhbodyu5nyr')
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
--
-- Después de aplicarlo, el Seguimiento tiene que mostrar 5:00 PM para Oropeza y
-- 5:30 PM para Perozo, las dos con Barry Clanton. Esta consulta lo confirma sin
-- abrir la pantalla:
--
-- SELECT p."lastName", to_char(a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver','HH24:MI') AS hora,
--        pr."firstName" || ' ' || pr."lastName" AS provider
--   FROM appointments a
--   JOIN cases c ON c."id" = a."caseId"
--   JOIN patients p ON p."id" = c."patientId"
--   LEFT JOIN providers pr ON pr."id" = a."providerId"
--  WHERE a."deletedAt" IS NULL
--    AND (p."lastName" ILIKE '%Oropeza Prezo%' OR p."lastName" ILIKE '%Perozo%')
--    AND (a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date = DATE '2026-09-22';
--
-- Debe devolver 2 filas: 17:00 y 17:30, ambas Barry Clanton.
