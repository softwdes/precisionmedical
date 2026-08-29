-- employee_metrics y doctor_metrics con tiempo POR MÓDULO. 2026-08-27.
-- Idempotente. Reemplaza las versiones de 20260806 / 20260812.
--
-- El único cambio de fondo: `activity` deja de ser un total suelto y pasa a
-- traer el desglose por módulo, con el total calculado como
-- bit_count(bit_or(mask)) para que un minuto vivido en dos módulos cuente UNA
-- vez (ver la nota de 20260827-activity-by-module.sql).

CREATE OR REPLACE FUNCTION public.employee_metrics(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
SELECT jsonb_build_object(
  'users', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'userId', u.id,
      'name',   nullif(trim(concat(u."firstName", ' ', u."lastName")), ''),
      'email',  u.email,
      'role',   u.role
    ) ORDER BY u."firstName", u."lastName"), '[]'::jsonb)
    FROM users u
    WHERE u."deletedAt" IS NULL
      AND u.role NOT IN ('LAWYER', 'AUDITOR_AI')
  ),
  'audit', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."actorUserId" AS "userId", a.action, count(*)::int AS n
      FROM audit_logs a
      WHERE a."actorUserId" IS NOT NULL
        AND a."actorType" = 'HUMAN_USER'
        AND a."createdAt" >= p_from AND a."createdAt" < p_to
      GROUP BY 1, 2
    ) x
  ),
  'callsById', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT c."agentUserId", c.direction, count(*)::int AS n,
             coalesce(sum(c."durationSeconds"), 0)::int AS "durationSeconds"
      FROM call_logs c
      WHERE c."agentUserId" IS NOT NULL
        AND c."createdAt" >= p_from AND c."createdAt" < p_to
      GROUP BY 1, 2
    ) x
  ),
  'callsByName', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT u.id AS "userId", c.direction, count(*)::int AS n,
             coalesce(sum(c."durationSeconds"), 0)::int AS "durationSeconds"
      FROM call_logs c
      JOIN users u
        ON lower(trim(concat(u."firstName", ' ', u."lastName"))) = lower(trim(c."agentName"))
      WHERE c."agentUserId" IS NULL AND c."agentName" IS NOT NULL
        AND c."createdAt" >= p_from AND c."createdAt" < p_to
      GROUP BY 1, 2
    ) x
  ),
  -- SMS enviados. A diferencia de las llamadas NO hace falta el puente
  -- UUID->email->users.id: message_logs."sentByUserId" ya guarda el cuid de
  -- users, porque lo escribe resolveActor() y no la identidad de Twilio.
  --
  -- Enviados Y entregados por separado a propósito: "mandó 40 SMS" no dice nada
  -- si 30 rebotaron. La brecha entre los dos números es la señal útil.
  -- (Bloque de otra sesión — se conserva textual al reemplazar la función.)
  'sms', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT m."sentByUserId" AS "userId",
             count(*)::int AS sent,
             count(*) FILTER (WHERE m.status = 'DELIVERED')::int AS delivered
      FROM message_logs m
      WHERE m."sentByUserId" IS NOT NULL
        AND m.channel = 'SMS'
        AND m."createdAt" >= p_from AND m."createdAt" < p_to
      GROUP BY 1
    ) x
  ),
  -- Total exacto por usuario: OR de todas las máscaras del rango.
  'activity', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT ua."userId",
             sum(bit_count((ua.or_mask)::bit(64)))::int AS minutes
      FROM (
        SELECT "userId", "bucketStart", bit_or("minutesMask") AS or_mask
        FROM user_activity
        WHERE "bucketStart" >= p_from AND "bucketStart" < p_to
        GROUP BY 1, 2
      ) ua
      GROUP BY 1
    ) x
  ),
  -- Desglose: cuántos de esos minutos en cada módulo. La suma puede superar al
  -- total (un minuto a caballo entre dos módulos cuenta en los dos) — es un
  -- reparto, no una partición, y así se muestra en la UI.
  'activityByModule', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT "userId", "module",
             sum(bit_count(("minutesMask")::bit(64)))::int AS minutes
      FROM user_activity
      WHERE "bucketStart" >= p_from AND "bucketStart" < p_to
      GROUP BY 1, 2
      HAVING sum(bit_count(("minutesMask")::bit(64))) > 0
    ) x
  ),
  -- Filas viejas (module = '') que no pueden atribuirse a ningún módulo: se
  -- reporta el total para que la UI pueda decir "N min sin módulo" en vez de
  -- fingir que el desglose está completo.
  'legacyMinutes', (
    SELECT coalesce(sum(bit_count(("minutesMask")::bit(64))), 0)::int
    FROM user_activity
    WHERE "bucketStart" >= p_from AND "bucketStart" < p_to AND "module" = ''
  )
);
$$;

-- doctor_metrics: mismo criterio de total exacto para el tiempo de uso.
CREATE OR REPLACE FUNCTION public.doctor_metrics(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH consult AS (
  SELECT a."providerId", a."patientId", a."admittedAt",
         coalesce(a."doctorDoneAt", a."checkedOutAt") AS ended
  FROM appointments a
  WHERE a."providerId" IS NOT NULL
    AND a.status::text NOT IN ('CANCELLED', 'NO_SHOW')
    AND coalesce(a."doctorDoneAt", a."checkedOutAt") >= p_from
    AND coalesce(a."doctorDoneAt", a."checkedOutAt") <  p_to
), timed AS (
  SELECT *,
         CASE WHEN "admittedAt" IS NOT NULL AND ended > "admittedAt"
              THEN EXTRACT(epoch FROM (ended - "admittedAt")) END AS secs
  FROM consult
)
SELECT jsonb_build_object(
  'doctors', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'providerId', p.id, 'userId', p."userId",
      'name', trim(concat(p."firstName", ' ', p."lastName")),
      'specialty', p.specialty
    ) ORDER BY p."firstName", p."lastName"), '[]'::jsonb)
    FROM providers p WHERE p."deletedAt" IS NULL AND p.status::text = 'ACTIVE'
  ),
  'activity', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT p.id AS "providerId", sum(bit_count((h.or_mask)::bit(64)))::int AS minutes
      FROM (
        SELECT "userId", "bucketStart", bit_or("minutesMask") AS or_mask
        FROM user_activity
        WHERE "bucketStart" >= p_from AND "bucketStart" < p_to
        GROUP BY 1, 2
      ) h
      JOIN providers p ON p."userId" = h."userId"
      GROUP BY 1
    ) x
  ),
  -- En qué parte del portal médico se fue el tiempo del doctor.
  'activityByModule', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT p.id AS "providerId", ua."module",
             sum(bit_count((ua."minutesMask")::bit(64)))::int AS minutes
      FROM user_activity ua
      JOIN providers p ON p."userId" = ua."userId"
      WHERE ua."bucketStart" >= p_from AND ua."bucketStart" < p_to
      GROUP BY 1, 2
      HAVING sum(bit_count((ua."minutesMask")::bit(64))) > 0
    ) x
  ),
  'consultations', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT "providerId",
             count(*)::int AS done,
             count(*) FILTER (WHERE secs IS NOT NULL AND secs <= 14400)::int AS measured,
             coalesce(avg(secs) FILTER (WHERE secs <= 14400), 0)::int AS "avgSeconds",
             count(*) FILTER (WHERE secs > 14400)::int AS "openEnded",
             count(DISTINCT "patientId")::int AS "uniquePatients"
      FROM timed GROUP BY 1
    ) x
  ),
  'rx', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM prescriptions rx JOIN appointments a ON a.id = rx."appointmentId"
      WHERE rx.status::text <> 'VOIDED'
        AND rx."createdAt" >= p_from AND rx."createdAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'labs', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM lab_orders lo JOIN appointments a ON a.id = lo."appointmentId"
      WHERE lo.status::text <> 'VOIDED'
        AND lo."orderedAt" >= p_from AND lo."orderedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'braces', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM appointment_braces b JOIN appointments a ON a.id = b."appointmentId"
      WHERE b.status::text <> 'VOIDED'
        AND b."dispensedAt" >= p_from AND b."dispensedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'services', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM appointment_services s JOIN appointments a ON a.id = s."appointmentId"
      WHERE s.status::text <> 'VOIDED'
        AND s."chargedAt" >= p_from AND s."chargedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  )
);
$$;

REVOKE ALL ON FUNCTION public.employee_metrics(timestamptz, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.doctor_metrics(timestamptz, timestamptz)   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_metrics(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.doctor_metrics(timestamptz, timestamptz)   TO service_role;
