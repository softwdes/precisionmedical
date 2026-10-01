-- ─────────────────────────────────────────────────────────────────────────────
-- Premios del Staff · métricas de PROVIDER
--
-- Pedido de Erick (2026-09-30): Devin participa con el rol "Provider", y sus
-- metas tienen que medir trabajo de provider y no de recepción. Tres métricas
-- nuevas, contadas igual que las demás (resultados, no clics):
--
--   NOTES_SIGNED    notas de visita que firmó en el mes (visit_notes.signedById)
--   CONSULTS_DONE   consultas que dio por terminadas (DOCTOR_DONE_WITH_PATIENT, una por cita)
--   LAB_ORDERS      órdenes de laboratorio que creó (CREATE_LAB_ORDER)
--
-- Medido en septiembre: Devin firmó 7 notas, terminó 5 consultas y creó 1 orden.
-- Es el único que firma notas en LM; el resto de su trabajo clínico sigue en
-- Medusa.
--
-- La función es la de 20260929c con esas tres métricas agregadas; el resto no
-- cambia.
--
-- Se aplica con:
--   cd packages/database && node scripts/apply-sql.cjs prisma/sql/20260930-premios-metricas-provider.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE reward_goals DROP CONSTRAINT IF EXISTS reward_goals_metric_check;
ALTER TABLE reward_goals ADD CONSTRAINT reward_goals_metric_check
  CHECK ((kind = 'METRIC') = (metric IS NOT NULL) AND (metric IS NULL OR metric IN (
    'APPTS_BOOKED', 'NEW_CASES', 'SAVED_APPTS', 'REACTIVATIONS', 'MEMBERSHIPS', 'MEMBERSHIPS_NEW',
    'SMS_PATIENTS', 'FORM_LINKS', 'CHECKINS', 'DOCUMENTS', 'CONFIRMATIONS',
    'NOTES_SIGNED', 'CONSULTS_DONE', 'LAB_ORDERS')));

CREATE OR REPLACE FUNCTION public.reward_progress(p_period_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH per AS (
  SELECT p.id, p.month,
         ((p.month::timestamp AT TIME ZONE 'America/Denver') AT TIME ZONE 'UTC') AS t_from,
         (((p.month + interval '1 month')::timestamp AT TIME ZONE 'America/Denver') AT TIME ZONE 'UTC') AS t_to
  FROM reward_periods p WHERE p.id = p_period_id
), part AS (
  SELECT rp."userId" FROM reward_participants rp WHERE rp."periodId" = p_period_id
), aud AS (
  -- Las acciones del mes de los participantes, una sola pasada por audit_logs.
  SELECT a."actorUserId" AS uid, a.action, a."entityId", a."entityType", a.before, a.after,
         (a."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS dia
  FROM audit_logs a, per
  WHERE a."actorType" = 'HUMAN_USER'
    AND a."createdAt" >= per.t_from AND a."createdAt" < per.t_to
    AND a."actorUserId" IN (SELECT "userId" FROM part)
), dia_min AS (
  SELECT x."userId", x.dia, sum(bit_count(x.m::bit(64)))::int AS minutos
  FROM (
    SELECT ua."userId", ua."bucketStart",
           (ua."bucketStart" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS dia,
           bit_or(ua."minutesMask") AS m
    FROM user_activity ua, per
    WHERE ua."bucketStart" >= per.t_from AND ua."bucketStart" < per.t_to
      AND ua."userId" IN (SELECT "userId" FROM part)
    GROUP BY 1, 2, 3
  ) x
  GROUP BY 1, 2
), dia_acc AS (
  SELECT uid AS "userId", dia, count(*)::int AS acciones
  FROM aud
  WHERE action NOT IN (
    'INTAKE_STEP_SAVE', 'PATIENT_COMPLETE_INTAKE', 'PATIENT_SIGN_LIEN',
    'PATIENT_SIGN_ATTENDANCE', 'SIGN_VISIT_NOTE', 'DOCTOR_DONE_WITH_PATIENT',
    'DOCTOR_REOPEN_VISIT', 'SCRIPTSURE_WEBHOOK', 'SCRIPTSURE_RX_UPDATED',
    'SCRIPTSURE_RX_RECEIVED', 'SCRIPTSURE_DRUG_HISTORY_SYNC')
  GROUP BY 1, 2
), uso AS (
  SELECT coalesce(m."userId", a."userId") AS "userId",
         sum(least(10, coalesce(m.minutos, 0) / 10 + coalesce(a.acciones, 0) / 5))::int AS puntos,
         count(*) FILTER (WHERE least(10, coalesce(m.minutos, 0) / 10 + coalesce(a.acciones, 0) / 5) > 0)::int AS dias
  FROM dia_min m
  FULL JOIN dia_acc a ON a."userId" = m."userId" AND a.dia = m.dia
  GROUP BY 1
), llamadas AS (
  SELECT u.id AS "userId", count(c.id)::int AS n
  FROM users u
  JOIN call_logs c
    ON (c."agentUserId" = u.id
        OR (c."agentUserId" IS NULL
            AND lower(trim(c."agentName")) = lower(trim(concat(u."firstName", ' ', u."lastName")))))
  , per
  WHERE u.id IN (SELECT "userId" FROM part)
    AND c."createdAt" >= per.t_from AND c."createdAt" < per.t_to
    AND c.outcome::text NOT IN ('FAILED')
  GROUP BY 1
), citas_mes AS (
  -- Citas agendadas en el mes por participantes, vigentes y no canceladas.
  SELECT ap.id, ap."patientId", ap."createdByUserId" AS uid, ap."createdAt"
  FROM appointments ap, per
  WHERE ap."createdAt" >= per.t_from AND ap."createdAt" < per.t_to
    AND ap."deletedAt" IS NULL AND ap.status::text NOT IN ('CANCELLED')
    AND ap."createdByUserId" IN (SELECT "userId" FROM part)
), reactiv AS (
  SELECT cm.uid, count(DISTINCT cm."patientId")::int AS n
  FROM citas_mes cm
  WHERE EXISTS (
    SELECT 1 FROM appointments pr
    WHERE pr."patientId" = cm."patientId" AND pr."deletedAt" IS NULL AND pr.status::text NOT IN ('CANCELLED', 'NO_SHOW')
      AND pr."scheduledFor" < cm."createdAt"
  )
  AND NOT EXISTS (
    SELECT 1 FROM appointments pr
    WHERE pr."patientId" = cm."patientId" AND pr."deletedAt" IS NULL AND pr.status::text NOT IN ('CANCELLED', 'NO_SHOW')
      AND pr."scheduledFor" < cm."createdAt" AND pr."scheduledFor" >= cm."createdAt" - interval '3 months'
  )
  GROUP BY 1
), salvadas AS (
  SELECT a.uid, count(DISTINCT a."entityId")::int AS n
  FROM aud a JOIN appointments ap ON ap.id = a."entityId"
  WHERE a.action = 'UPDATE_APPOINTMENT'
    AND (a.before->>'scheduledFor') IS DISTINCT FROM (a.after->>'scheduledFor')
    AND ap."deletedAt" IS NULL AND ap.status::text NOT IN ('CANCELLED', 'NO_SHOW')
  GROUP BY 1
), memb AS (
  -- Cada membresía del mes, con la cita más cercana a su inicio y quién la agendó.
  SELECT m.id,
         (SELECT ap."createdByUserId" FROM appointments ap
           WHERE ap."patientId" = m."patientId" AND ap."deletedAt" IS NULL
             AND abs(extract(epoch FROM (ap."scheduledFor" - m."fechaInicio"::timestamp))) <= 86400 * 3
           ORDER BY abs(extract(epoch FROM (ap."scheduledFor" - m."fechaInicio"::timestamp))) LIMIT 1) AS uid,
         (SELECT min(ap."scheduledFor") FROM appointments ap
           WHERE ap."patientId" = m."patientId" AND ap."deletedAt" IS NULL
             AND ap.status::text NOT IN ('CANCELLED', 'NO_SHOW')) AS primera,
         m."fechaInicio"
  FROM patient_memberships m, per
  WHERE m."patientId" IS NOT NULL
    AND m."fechaInicio" >= per.month AND m."fechaInicio" < (per.month + interval '1 month')
), memb_u AS (
  SELECT uid, count(*)::int AS n,
         count(*) FILTER (WHERE primera >= "fechaInicio"::timestamp - interval '3 days')::int AS nuevas
  FROM memb WHERE uid IS NOT NULL GROUP BY 1
), sms AS (
  SELECT ml."sentByUserId" AS uid,
         count(DISTINCT (ml."patientId", (ml."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date))::int AS n
  FROM message_logs ml, per
  WHERE ml.channel::text = 'SMS' AND coalesce(ml.direction::text, 'OUTBOUND') = 'OUTBOUND'
    AND ml."patientId" IS NOT NULL
    AND ml."createdAt" >= per.t_from AND ml."createdAt" < per.t_to
    AND ml."sentByUserId" IN (SELECT "userId" FROM part)
  GROUP BY 1
), acc AS (
  SELECT uid,
         count(*) FILTER (WHERE action = 'CREATE_CASE_FROM_CALL')::int AS casos,
         count(DISTINCT ("entityId", dia)) FILTER (WHERE action = 'SEND_PORTAL_LINK')::int AS links,
         count(DISTINCT "entityId") FILTER (WHERE action = 'CHECK_IN')::int AS checkins,
         count(DISTINCT ("entityId", dia)) FILTER (WHERE action = 'UPLOAD_DOCUMENT')::int AS docs,
         count(DISTINCT "entityId") FILTER (WHERE action = 'CONFIRM_APPOINTMENT')::int AS confirmadas,
         count(DISTINCT "entityId") FILTER (WHERE action = 'DOCTOR_DONE_WITH_PATIENT')::int AS consultas,
         count(*) FILTER (WHERE action = 'CREATE_LAB_ORDER')::int AS labs
  FROM aud GROUP BY 1
), notas AS (
  -- Notas firmadas en el mes por quien firma (la nota queda inmutable al firmarse).
  SELECT v."signedById" AS uid, count(*)::int AS n
  FROM visit_notes v, per
  WHERE v."signedById" IN (SELECT "userId" FROM part)
    AND v."signedAt" >= per.t_from AND v."signedAt" < per.t_to
  GROUP BY 1
), reg AS (
  SELECT e."userId", e."categoryCode",
         count(*) FILTER (WHERE e.status = 'VERIFIED')::int AS verificados,
         count(*) FILTER (WHERE e.status = 'VERIFIED' AND e."isNewPatient")::int AS verificados_new,
         coalesce(sum(e.points) FILTER (WHERE e.status = 'VERIFIED'), 0)::int AS puntos
  FROM reward_entries e
  WHERE e."periodId" = p_period_id
  GROUP BY 1, 2
), pend AS (
  SELECT e."userId", count(*)::int AS n
  FROM reward_entries e
  WHERE e."periodId" = p_period_id AND e.status = 'PENDING'
  GROUP BY 1
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'userId',  pt."userId",
  'entries', coalesce((
     SELECT jsonb_agg(jsonb_build_object(
       'categoryCode', r."categoryCode", 'verified', r.verificados,
       'verifiedNew', r.verificados_new, 'points', r.puntos))
     FROM reg r WHERE r."userId" = pt."userId"), '[]'::jsonb),
  'pending',     coalesce((SELECT n FROM pend WHERE pend."userId" = pt."userId"), 0),
  'calls',       coalesce((SELECT n FROM llamadas l WHERE l."userId" = pt."userId"), 0),
  'usagePoints', coalesce((SELECT puntos FROM uso WHERE uso."userId" = pt."userId"), 0),
  'usageDays',   coalesce((SELECT dias FROM uso WHERE uso."userId" = pt."userId"), 0),
  'metrics', jsonb_build_object(
    'APPTS_BOOKED',    (SELECT count(*)::int FROM citas_mes cm WHERE cm.uid = pt."userId"),
    'NEW_CASES',       coalesce((SELECT casos FROM acc WHERE acc.uid = pt."userId"), 0),
    'SAVED_APPTS',     coalesce((SELECT n FROM salvadas s WHERE s.uid = pt."userId"), 0),
    'REACTIVATIONS',   coalesce((SELECT n FROM reactiv r WHERE r.uid = pt."userId"), 0),
    'MEMBERSHIPS',     coalesce((SELECT n FROM memb_u mu WHERE mu.uid = pt."userId"), 0),
    'MEMBERSHIPS_NEW', coalesce((SELECT nuevas FROM memb_u mu WHERE mu.uid = pt."userId"), 0),
    'SMS_PATIENTS',    coalesce((SELECT n FROM sms WHERE sms.uid = pt."userId"), 0),
    'FORM_LINKS',      coalesce((SELECT links FROM acc WHERE acc.uid = pt."userId"), 0),
    'CHECKINS',        coalesce((SELECT checkins FROM acc WHERE acc.uid = pt."userId"), 0),
    'DOCUMENTS',       coalesce((SELECT docs FROM acc WHERE acc.uid = pt."userId"), 0),
    'CONFIRMATIONS',   coalesce((SELECT confirmadas FROM acc WHERE acc.uid = pt."userId"), 0),
    'NOTES_SIGNED',    coalesce((SELECT n FROM notas WHERE notas.uid = pt."userId"), 0),
    'CONSULTS_DONE',   coalesce((SELECT consultas FROM acc WHERE acc.uid = pt."userId"), 0),
    'LAB_ORDERS',      coalesce((SELECT labs FROM acc WHERE acc.uid = pt."userId"), 0)
  )
)), '[]'::jsonb)
FROM part pt;
$$;

GRANT EXECUTE ON FUNCTION public.reward_progress(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reward_progress(text) FROM anon, authenticated, public;

COMMIT;

NOTIFY pgrst, 'reload schema';
