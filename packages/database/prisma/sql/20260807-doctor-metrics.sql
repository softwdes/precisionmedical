-- Métricas por doctor — Admin → Métricas → tab Doctores. 2026-08-07.
-- Idempotente. Mismo patrón que 20260806-employee-metrics-fn.sql: PostgREST
-- no agrega, así que la agregación vive acá y el tRPC del Admin llama por
-- .rpc() con el service role.
--
-- Duración de la consulta (definición de Erick 2026-08-07): el staff pasa al
-- paciente a consulta después del triaje (admittedAt, sellado en el botón
-- "Admitir a sala") y el doctor o el asistente cierran (doctorDoneAt o
-- checkedOutAt, lo que ocurra primero). checkedInAt NO sirve de inicio:
-- incluye sala de espera y triaje.

-- ─── Columna admittedAt + backfill desde el audit log ────────────────────────

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "admittedAt" TIMESTAMP(3);

-- Las admisiones ya hechas dejaron su hora en audit_logs (ADMIT_TO_ROOM,
-- metadata.admittedAt). Solo filas sin sello — nunca pisa un valor real.
UPDATE "appointments" a
SET "admittedAt" = sub.at
FROM (
  SELECT DISTINCT ON ("entityId")
         "entityId",
         ((metadata ->> 'admittedAt')::timestamptz AT TIME ZONE 'UTC') AS at
  FROM audit_logs
  WHERE action = 'ADMIT_TO_ROOM'
    AND metadata ->> 'admittedAt' IS NOT NULL
  ORDER BY "entityId", "createdAt" ASC
) sub
WHERE a.id = sub."entityId"
  AND a."admittedAt" IS NULL;

-- ─── Fin de consulta: doctorDoneAt, o el checkout si el doctor no marcó ──────
-- (expresión repetida en las fns; PG no permite constantes compartidas en SQL)

-- ─── 1) Agregado por doctor ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.doctor_metrics(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT jsonb_build_object(
  'doctors', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'providerId', p.id,
      'userId',     p."userId",
      'name',       trim(concat(p."firstName", ' ', p."lastName")),
      'specialty',  p.specialty
    ) ORDER BY p."firstName", p."lastName"), '[]'::jsonb)
    FROM providers p
    WHERE p."deletedAt" IS NULL AND p.status::text = 'ACTIVE'
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
      SELECT a."providerId",
             count(*)::int AS done,
             count(*) FILTER (
               WHERE a."admittedAt" IS NOT NULL
             )::int AS measured,
             coalesce(avg(
               extract(epoch FROM (coalesce(a."doctorDoneAt", a."checkedOutAt") - a."admittedAt"))
             ) FILTER (
               WHERE a."admittedAt" IS NOT NULL
                 AND coalesce(a."doctorDoneAt", a."checkedOutAt") > a."admittedAt"
             ), 0)::int AS "avgSeconds",
             count(DISTINCT a."patientId")::int AS "uniquePatients"
      FROM appointments a
      WHERE a."providerId" IS NOT NULL
        AND a.status::text NOT IN ('CANCELLED', 'NO_SHOW')
        AND coalesce(a."doctorDoneAt", a."checkedOutAt") >= p_from
        AND coalesce(a."doctorDoneAt", a."checkedOutAt") < p_to
      GROUP BY 1
    ) x
  ),
  'rx', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM prescriptions rx
      JOIN appointments a ON a.id = rx."appointmentId"
      WHERE rx.status::text NOT IN ('VOIDED')
        AND rx."createdAt" >= p_from AND rx."createdAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'labs', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM lab_orders lo
      JOIN appointments a ON a.id = lo."appointmentId"
      WHERE lo.status::text <> 'VOIDED'
        AND lo."orderedAt" >= p_from AND lo."orderedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'braces', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM appointment_braces b
      JOIN appointments a ON a.id = b."appointmentId"
      WHERE b.status::text <> 'VOIDED'
        AND b."dispensedAt" >= p_from AND b."dispensedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  ),
  'services', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
      SELECT a."providerId", count(*)::int AS n
      FROM appointment_services s
      JOIN appointments a ON a.id = s."appointmentId"
      WHERE s.status::text <> 'VOIDED'
        AND s."chargedAt" >= p_from AND s."chargedAt" < p_to
        AND a."providerId" IS NOT NULL
      GROUP BY 1
    ) x
  )
);
$$;

-- ─── 2) Consultas de un doctor en el rango (drill-down nivel 1) ───────────────

CREATE OR REPLACE FUNCTION public.doctor_consultations(
  p_provider text, p_from timestamptz, p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."endedAt" DESC), '[]'::jsonb) FROM (
  SELECT a.id,
         a."scheduledFor",
         a."checkedInAt",
         a."admittedAt",
         a."doctorDoneAt",
         a."checkedOutAt",
         coalesce(a."doctorDoneAt", a."checkedOutAt") AS "endedAt",
         a.status,
         trim(concat(pt."firstName", ' ', pt."lastName")) AS "patientName",
         pt."patientCode",
         vn.status::text  AS "noteStatus",
         vn."signedAt",
         (SELECT count(*)::int FROM prescriptions rx
           WHERE rx."appointmentId" = a.id AND rx.status::text <> 'VOIDED') AS "rxCount",
         (SELECT count(*)::int FROM lab_orders lo
           WHERE lo."appointmentId" = a.id AND lo.status::text <> 'VOIDED') AS "labCount",
         (SELECT count(*)::int FROM appointment_braces b
           WHERE b."appointmentId" = a.id AND b.status::text <> 'VOIDED') AS "braceCount",
         (SELECT count(*)::int FROM appointment_services s
           WHERE s."appointmentId" = a.id AND s.status::text <> 'VOIDED') AS "serviceCount"
  FROM appointments a
  JOIN patients pt ON pt.id = a."patientId"
  LEFT JOIN visit_notes vn ON vn."appointmentId" = a.id
  WHERE a."providerId" = p_provider
    AND a.status::text NOT IN ('CANCELLED', 'NO_SHOW')
    AND coalesce(a."doctorDoneAt", a."checkedOutAt") >= p_from
    AND coalesce(a."doctorDoneAt", a."checkedOutAt") < p_to
) x;
$$;

-- ─── 3) Detalle de la consulta (drill-down nivel 2, espejo del Resumen) ──────

CREATE OR REPLACE FUNCTION public.consultation_detail(p_appointment text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT jsonb_build_object(
  'appointment', (
    SELECT jsonb_build_object(
      'id', a.id,
      'scheduledFor', a."scheduledFor",
      'checkedInAt',  a."checkedInAt",
      'admittedAt',   a."admittedAt",
      'doctorDoneAt', a."doctorDoneAt",
      'checkedOutAt', a."checkedOutAt",
      'status',       a.status,
      'patientName',  trim(concat(pt."firstName", ' ', pt."lastName")),
      'patientCode',  pt."patientCode",
      'providerName', trim(concat(pr."firstName", ' ', pr."lastName")),
      'caseCode',     cs."caseCode"
    )
    FROM appointments a
    JOIN patients pt ON pt.id = a."patientId"
    LEFT JOIN providers pr ON pr.id = a."providerId"
    LEFT JOIN cases cs ON cs.id = a."caseId"
    WHERE a.id = p_appointment
  ),
  'triage', (
    SELECT to_jsonb(t) - 'id' - 'appointmentId' FROM (
      SELECT tr."systolicMmhg", tr."diastolicMmhg", tr."pulseBpm",
             tr."respiratoryRate", tr."tempFahrenheit", tr."o2Saturation",
             tr."painScale", tr."heightFt", tr."heightIn", tr."weightLbs",
             tr."chiefComplaint", tr."capturedByName", tr.id, tr."appointmentId"
      FROM triage_records tr WHERE tr."appointmentId" = p_appointment
    ) t
  ),
  'note', (
    SELECT jsonb_build_object(
      'status', vn.status, 'signedAt', vn."signedAt",
      'signedByName', vn."signedByName",
      'diagnoses', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'icd10Code', d."icd10Code", 'icd10Label', d."icd10Label"
        ) ORDER BY d."sortOrder"), '[]'::jsonb)
        FROM visit_note_diagnoses d WHERE d."noteId" = vn.id
      ),
      'serviceCodes', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'cptCode', sc."cptCode", 'units', sc.units, 'fee', sc."feeCatalog"
        )), '[]'::jsonb)
        FROM visit_service_codes sc WHERE sc."visitNoteId" = vn.id
      )
    )
    FROM visit_notes vn WHERE vn."appointmentId" = p_appointment
  ),
  'labs', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'studyName', lo."studyName", 'status', lo.status,
      'orderedAt', lo."orderedAt", 'urgency', lo.urgency
    ) ORDER BY lo."orderedAt"), '[]'::jsonb)
    FROM lab_orders lo
    WHERE lo."appointmentId" = p_appointment AND lo.status::text <> 'VOIDED'
  ),
  'rx', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'drugName', rx."drugName", 'dose', rx.dose, 'frequency', rx.frequency,
      'status', rx.status, 'createdAt', rx."createdAt"
    ) ORDER BY rx."createdAt"), '[]'::jsonb)
    FROM prescriptions rx
    WHERE rx."appointmentId" = p_appointment AND rx.status::text <> 'VOIDED'
  ),
  'braces', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', b.name, 'side', b.side, 'quantity', b.quantity,
      'unitPrice', b."unitPrice", 'status', b.status
    )), '[]'::jsonb)
    FROM appointment_braces b
    WHERE b."appointmentId" = p_appointment AND b.status::text <> 'VOIDED'
  ),
  'services', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name, 'quantity', s.quantity,
      'unitPrice', s."unitPrice", 'status', s.status
    )), '[]'::jsonb)
    FROM appointment_services s
    WHERE s."appointmentId" = p_appointment AND s.status::text <> 'VOIDED'
  ),
  'billing', (
    SELECT jsonb_build_object(
      'totalCost',  coalesce(sum(ab."totalCost"), 0),
      'amountPaid', coalesce(sum(ab."amountPaid"), 0),
      'balanceDue', coalesce(sum(ab."balanceDue"), 0),
      'payments', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'amount', bp.amount, 'method', bp.method, 'source', bp.source,
          'paidAt', bp."paidAt"
        ) ORDER BY bp."paidAt"), '[]'::jsonb)
        FROM billing_payments bp
        JOIN appointment_billing ab2 ON ab2.id = bp."billingId"
        WHERE ab2."appointmentId" = p_appointment
          AND bp.status::text = 'COMPLETED'
      )
    )
    FROM appointment_billing ab
    WHERE ab."appointmentId" = p_appointment
  )
);
$$;

-- ─── Permisos: solo el service role del Admin ─────────────────────────────────

REVOKE ALL ON FUNCTION public.doctor_metrics(timestamptz, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.doctor_consultations(text, timestamptz, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.consultation_detail(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_metrics(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.doctor_consultations(text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultation_detail(text) TO service_role;
