-- Tiempo por módulo: reparto FRACCIONADO. 2026-09-10.
-- Idempotente. Reemplaza `employee_metrics` y `doctor_metrics` de 20260827.
--
-- ─── El problema que cierra ──────────────────────────────────────────────────
--
-- `activityByModule` sumaba un minuto entero a CADA módulo que lo reclamaba, y
-- por eso el desglose nunca daba el total: medido el 2026-09-10 sobre 7 días,
-- 6751 minutos de uso real se presentaban como 7871 repartidos (+16.6%, y hasta
-- +24.7% en una persona). Alguien que sumaba las barras del detalle veía 18h
-- donde el encabezado decía 14h24m.
--
-- La causa no es un bug de suma: el latido marca el minuto en curso cada 20s,
-- así que en el minuto en que alguien cambia de pantalla quedan encendidos DOS
-- módulos. El total (`activity`) siempre estuvo bien porque hace la UNIÓN de
-- las máscaras (`bit_or`); el desglose hacía la suma.
--
-- ─── Cómo se reparte ahora ───────────────────────────────────────────────────
--
-- Cada minuto se abre en bits (`generate_series(0,59)`), se cuenta cuántos
-- módulos lo reclaman (`k`) y cada uno se lleva `1/k`. La suma de las partes
-- vuelve a ser la cantidad de minutos distintos vividos, o sea el total exacto.
--
-- Se eligió fraccionar y no adjudicar el minuto a un solo módulo: cualquier
-- regla de desempate (el primero, el último, el de mayor prioridad) inventa una
-- verdad que el dato no tiene —el bitmap no guarda el orden dentro del minuto—
-- y además le regalaría sistemáticamente los minutos de frontera al mismo
-- módulo. Medio minuto para cada uno es lo único que el dato sostiene.
--
-- Los valores dejan de ser enteros (`numeric`, un decimal). La UI redondea para
-- mostrar, así que el desglose puede diferir del total en menos de un minuto
-- por redondeo — no por doble conteo.
--
-- El resto de la función es IDÉNTICO a 20260827: `CREATE OR REPLACE` reemplaza
-- el cuerpo entero, así que se copia completo aunque solo cambie un bloque.

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
  -- Total exacto por usuario: OR de todas las máscaras del rango. Un minuto
  -- vivido en dos módulos cuenta UNA vez. Este bloque no cambió.
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
  -- Desglose: cuántos de esos minutos en cada módulo, con el minuto compartido
  -- repartido en fracciones. La suma de las partes ES el total de arriba.
  'activityByModule', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      WITH claims AS (
        SELECT ua."userId", ua."bucketStart", ua."module", b AS minuto
        FROM user_activity ua, generate_series(0, 59) AS b
        WHERE ua."bucketStart" >= p_from AND ua."bucketStart" < p_to
          AND ((ua."minutesMask" >> b) & 1) = 1
      ), peso AS (
        SELECT "userId", "bucketStart", minuto, count(*)::numeric AS k
        FROM claims GROUP BY 1, 2, 3
      )
      SELECT c."userId", c."module", round(sum(1.0 / w.k), 1) AS minutes
      FROM claims c
      JOIN peso w
        ON w."userId" = c."userId"
       AND w."bucketStart" = c."bucketStart"
       AND w.minuto = c.minuto
      GROUP BY 1, 2
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

-- doctor_metrics: mismo reparto fraccionado para el tiempo por módulo del
-- portal médico. El tab Doctores tenía la misma brecha, y aunque hoy casi no se
-- note —un provider vive en un solo módulo, así que su k es 1 y no tiene
-- minutos de frontera (devin: 205 = 205 el 2026-09-10)— dejarlo distinto
-- garantizaba que el día que un provider pase por Pacientes o Calendario los
-- dos tabs contaran diferente.
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
  -- En qué parte del portal médico se fue el tiempo del doctor, con el minuto
  -- compartido repartido en fracciones (ver la nota de arriba).
  'activityByModule', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      WITH claims AS (
        SELECT ua."userId", ua."bucketStart", ua."module", b AS minuto
        FROM user_activity ua, generate_series(0, 59) AS b
        WHERE ua."bucketStart" >= p_from AND ua."bucketStart" < p_to
          AND ((ua."minutesMask" >> b) & 1) = 1
      ), peso AS (
        SELECT "userId", "bucketStart", minuto, count(*)::numeric AS k
        FROM claims GROUP BY 1, 2, 3
      )
      SELECT p.id AS "providerId", c."module", round(sum(1.0 / w.k), 1) AS minutes
      FROM claims c
      JOIN peso w
        ON w."userId" = c."userId"
       AND w."bucketStart" = c."bucketStart"
       AND w.minuto = c.minuto
      JOIN providers p ON p."userId" = c."userId"
      GROUP BY 1, 2
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

-- ─── Verificación (correr después de aplicar) ────────────────────────────────
-- Las partes tienen que dar el total. Cero filas = arreglado.
--
--   WITH m AS (SELECT employee_metrics(now() - interval '7 days', now()) AS p)
--   SELECT t.email, t.total, t.desglose
--   FROM m, LATERAL (
--     SELECT u->>'email' AS email,
--            (SELECT (a->>'minutes')::numeric FROM jsonb_array_elements(m.p->'activity') a
--              WHERE a->>'userId' = u->>'userId') AS total,
--            (SELECT round(sum((b->>'minutes')::numeric), 1) FROM jsonb_array_elements(m.p->'activityByModule') b
--              WHERE b->>'userId' = u->>'userId') AS desglose
--     FROM jsonb_array_elements(m.p->'users') u
--   ) t
--   WHERE t.desglose IS NOT NULL AND abs(t.total - t.desglose) > 0.5;
