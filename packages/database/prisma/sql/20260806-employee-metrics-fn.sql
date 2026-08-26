-- Métricas por empleado — función de agregación para el Admin (apps/web).
-- 2026-08-06. Idempotente (CREATE OR REPLACE).
--
-- apps/web no tiene Prisma contra esta DB: lee por PostgREST con el service
-- role (patrón del tab Comunicaciones). PostgREST no agrega, así que la
-- agregación vive acá y el Admin la llama con .rpc('employee_metrics', ...).
--
-- OJO CallLog.agentUserId: es el UUID de Supabase Auth y — tras la
-- unificación — las cuentas del staff viven en el proyecto ADMIN, no en el
-- auth de esta DB. Por eso las llamadas con agentUserId se devuelven CRUDAS
-- (callsById) y el puente UUID→email→users.id lo hace el tRPC del Admin con
-- su propio auth. Las llamadas viejas sin agentUserId se atribuyen acá por
-- nombre (callsByName), acotadas a filas sin identidad real — mismo criterio
-- que isMe() en call-logs del back-office.

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
      SELECT c."agentUserId",
             c.direction,
             count(*)::int AS n,
             coalesce(sum(c."durationSeconds"), 0)::int AS "durationSeconds"
      FROM call_logs c
      WHERE c."agentUserId" IS NOT NULL
        AND c."createdAt" >= p_from AND c."createdAt" < p_to
      GROUP BY 1, 2
    ) x
  ),
  'callsByName', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT u.id AS "userId",
             c.direction,
             count(*)::int AS n,
             coalesce(sum(c."durationSeconds"), 0)::int AS "durationSeconds"
      FROM call_logs c
      JOIN users u
        ON lower(trim(concat(u."firstName", ' ', u."lastName"))) = lower(trim(c."agentName"))
      WHERE c."agentUserId" IS NULL
        AND c."agentName" IS NOT NULL
        AND c."createdAt" >= p_from AND c."createdAt" < p_to
      GROUP BY 1, 2
    ) x
  ),
  -- SMS enviados. A diferencia de las llamadas NO hace falta el puente
  -- UUID->email->users.id: message_logs."sentByUserId" ya guarda el cuid de
  -- users, porque lo escribe resolveActor() y no la identidad de Twilio.
  --
  -- Se devuelven enviados Y entregados por separado a proposito: "mando 40
  -- SMS" no dice nada si 30 rebotaron. La brecha entre los dos numeros es la
  -- señal util — indica que esa persona esta escribiendo a numeros malos.
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
  'activity', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT ua."userId", sum(ua."activeMinutes")::int AS minutes
      FROM user_activity ua
      WHERE ua."bucketStart" >= p_from AND ua."bucketStart" < p_to
      GROUP BY 1
    ) x
  )
);
$$;

-- Solo el service role del Admin la llama — nunca el navegador.
REVOKE ALL ON FUNCTION public.employee_metrics(timestamptz, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.employee_metrics(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.employee_metrics(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.employee_metrics(timestamptz, timestamptz) TO service_role;
