-- ─────────────────────────────────────────────────────────────────────────────
-- Premios del Staff · lo que el sistema sabe de cada registro pendiente
--
-- Pedido de Erick (2026-09-29): en "Verificar", el Admin tiene que ver al lado
-- de cada logro declarado lo que el SISTEMA tiene registrado sobre ese hecho,
-- para aprobar con datos y no de palabra.
--
-- La función NO decide nada: devuelve hechos crudos por registro (qué citas
-- tuvo el paciente ese día, si aparece en el CSV de membresías, quién creó la
-- cita, si se reprogramó o se canceló, qué se le cobró) y la pantalla los
-- traduce a "coincide / no coincide / sin dato". Así el texto queda en el
-- idioma de quien mira (el servidor no sabe el idioma) y la regla de qué
-- cuenta como evidencia se puede afinar sin tocar la base.
--
-- Fechas: `occurredOn` es un día de la clínica; las columnas `timestamp` están
-- en UTC, así que se pasan a America/Denver antes de comparar días.
--
-- Se aplica con:
--   cd packages/database && node scripts/apply-sql.cjs prisma/sql/20260929b-premios-evidencia.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.reward_evidence(p_period_id text)
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
), e AS (
  SELECT x.* FROM reward_entries x WHERE x."periodId" = p_period_id AND x.status = 'PENDING'
), citas AS (
  -- Las citas vigentes de los pacientes que aparecen en la cola.
  SELECT a.id, a."patientId", a.status::text AS status, a."createdByUserId", a."createdAt",
         a."scheduledFor",
         (a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS dia,
         c.name AS clinica
  FROM appointments a
  LEFT JOIN clinics c ON c.id = a."clinicId"
  WHERE a."deletedAt" IS NULL
    AND a."patientId" IN (SELECT "patientId" FROM e WHERE "patientId" IS NOT NULL)
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'entryId', e.id,

  -- Otro registro (de cualquiera, no rechazado) del mismo logro y el mismo paciente en el mes.
  'duplicates', (
    SELECT count(*)::int FROM reward_entries o
    WHERE o."periodId" = e."periodId" AND o.id <> e.id AND o.status <> 'REJECTED'
      AND o."categoryCode" = e."categoryCode"
      AND e."patientId" IS NOT NULL AND o."patientId" = e."patientId"
  ),

  -- ¿El paciente tuvo cita ese día?
  'apptsOnDay', coalesce((
    SELECT jsonb_agg(jsonb_build_object('status', ci.status, 'clinic', ci.clinica) ORDER BY ci."scheduledFor")
    FROM citas ci WHERE ci."patientId" = e."patientId" AND ci.dia = e."occurredOn"
  ), '[]'::jsonb),

  -- Membresías (CSV semanal): la más reciente del paciente.
  'membership', (
    SELECT jsonb_build_object('plan', m.plan, 'start', m."fechaInicio", 'inLastCut', m."enUltimoCorte")
    FROM patient_memberships m WHERE m."patientId" = e."patientId"
    ORDER BY m."fechaInicio" DESC NULLS LAST LIMIT 1
  ),

  -- Alta y fuente del paciente.
  'patientCreatedAt', (SELECT pa."createdAt" FROM patients pa WHERE pa.id = e."patientId"),
  'referralSource',   (SELECT pa."referralSource"::text FROM patients pa WHERE pa.id = e."patientId"),

  -- Primera cita válida del paciente, y si la creó quien declara.
  'firstVisit', (
    SELECT jsonb_build_object('at', ci."scheduledFor", 'bySelf', ci."createdByUserId" = e."userId")
    FROM citas ci WHERE ci."patientId" = e."patientId" AND ci.status NOT IN ('CANCELLED', 'NO_SHOW')
    ORDER BY ci."scheduledFor" LIMIT 1
  ),

  -- Citas del paciente creadas por quien declara, dentro del mes.
  'apptsCreatedBySelf', (
    SELECT count(*)::int FROM citas ci, per
    WHERE ci."patientId" = e."patientId" AND ci."createdByUserId" = e."userId"
      AND ci."createdAt" >= per.t_from AND ci."createdAt" < per.t_to
  ),

  -- Reprogramaciones hechas por quien declara (la fecha cambió) sobre citas de este
  -- paciente, en el mes, y cuántas de esas citas terminaron canceladas igual.
  'reschedulesBySelf', (
    SELECT count(DISTINCT al."entityId")::int
    FROM audit_logs al JOIN citas ci ON ci.id = al."entityId", per
    WHERE al.action = 'UPDATE_APPOINTMENT' AND al."actorUserId" = e."userId"
      AND ci."patientId" = e."patientId"
      AND al."createdAt" >= per.t_from AND al."createdAt" < per.t_to
      AND (al.before->>'scheduledFor') IS DISTINCT FROM (al.after->>'scheduledFor')
  ),
  'cancelledInMonth', (
    SELECT count(*)::int FROM citas ci, per
    WHERE ci."patientId" = e."patientId" AND ci.status = 'CANCELLED'
      AND ci."scheduledFor" >= per.t_from AND ci."scheduledFor" < per.t_to
  ),

  -- Para reactivaciones: la última visita ANTES del mes. Visita = cita no cancelada ni
  -- no-show: las migradas del v2 quedaron en PENDING, no en COMPLETED.
  'lastVisitBefore', (
    SELECT max(ci."scheduledFor") FROM citas ci, per
    WHERE ci."patientId" = e."patientId" AND ci.status NOT IN ('CANCELLED', 'NO_SHOW') AND ci."scheduledFor" < per.t_from
  ),

  -- Lo que se le cobró al paciente ese día (servicios de sus citas del día).
  'servicesOnDay', coalesce((
    SELECT jsonb_agg(jsonb_build_object('name', s.name, 'by', s."chargedByName"))
    FROM appointment_services s JOIN citas ci ON ci.id = s."appointmentId"
    WHERE ci."patientId" = e."patientId" AND ci.dia = e."occurredOn" AND s."voidedAt" IS NULL
  ), '[]'::jsonb)
)), '[]'::jsonb)
FROM e;
$$;

GRANT EXECUTE ON FUNCTION public.reward_evidence(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reward_evidence(text) FROM anon, authenticated, public;

COMMIT;

NOTIFY pgrst, 'reload schema';
