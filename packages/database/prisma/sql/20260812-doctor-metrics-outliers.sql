-- Métricas por doctor: sacar del promedio las consultas mal cerradas. 2026-08-12.
-- Idempotente (CREATE OR REPLACE). Reemplaza a doctor_metrics de
-- 20260807-doctor-metrics.sql; doctor_consultations y consultation_detail siguen igual.
--
-- El problema, visto en datos reales: una consulta quedó registrada en 411
-- minutos (6.9 h) porque el doctor nunca marcó "Terminé" y el asistente hizo el
-- checkout al cierre del día. Con 8 consultas en el período, ese solo caso
-- llevaba el promedio de ~7 min a más de 70 — un número que no describe a nadie
-- y que vuelve inservible la columna.
--
-- Regla: una consulta de más de MAX (4 h) no es una consulta larga, es un
-- cierre olvidado. No entra al promedio y se reporta aparte (`openEnded`) para
-- que el dato no desaparezca en silencio: si un doctor acumula muchas, el
-- problema es que no está cerrando sus visitas, y eso también hay que verlo.

CREATE OR REPLACE FUNCTION public.doctor_metrics(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH consult AS (
  SELECT a."providerId",
         a."patientId",
         a."admittedAt",
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
      SELECT p.id AS "providerId", sum(ua."activeMinutes")::int AS minutes
      FROM user_activity ua
      JOIN providers p ON p."userId" = ua."userId"
      WHERE ua."bucketStart" >= p_from AND ua."bucketStart" < p_to
      GROUP BY 1
    ) x
  ),
  'consultations', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT "providerId",
             count(*)::int AS done,
             -- Solo las que entran al promedio: con inicio sellado y duración creíble.
             count(*) FILTER (WHERE secs IS NOT NULL AND secs <= 14400)::int AS measured,
             coalesce(avg(secs) FILTER (WHERE secs <= 14400), 0)::int AS "avgSeconds",
             -- Cierre olvidado: se muestra aparte, nunca se promedia.
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

REVOKE ALL ON FUNCTION public.doctor_metrics(timestamptz, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_metrics(timestamptz, timestamptz) TO service_role;
