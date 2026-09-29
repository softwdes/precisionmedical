-- ─────────────────────────────────────────────────────────────────────────────
-- Premios del Staff · tablas, catálogo y función de avance
--
-- Reemplaza el Excel "Monthly Incentive Payroll / Marketing Incentive Dashboard
-- v4". Reglas decididas por Erick el 2026-09-28:
--
--   · Una sola bolsa por mes, sin división por clínica.
--   · parte = bolsa ÷ participantes (la manager cuenta como una más).
--   · staff:   cobra = parte × metas cumplidas ÷ metas del mes (hoy 8).
--   · manager: cobra = parte × avance promedio del staff.
--   · Lo que nadie cobra vuelve a la clínica. Los montos son privados.
--   · Los PUNTOS se muestran pero no deciden la plata; la deciden las metas.
--   · Meta 8 = uso del sistema (lo mismo que mide la Carrera), con tope diario
--     para que inflar no sirva.
--
-- El cálculo del PAGO vive en TypeScript (`packages/database/src/premios.ts`),
-- que usan las dos apps. Esta función solo junta los CONTEOS crudos: así el
-- back-office (Prisma) y el Admin (REST, `rpc`) leen exactamente lo mismo.
--
-- Todo `CREATE TABLE` a mano lleva su GRANT (ver la trampa de
-- push_subscriptions, 20260914): solo `service_role`, que es como entra el
-- Admin. `anon` y `authenticated` no reciben nada: son montos de nómina.
--
-- Los `id` son TEXT sin default, igual que el resto del schema: los genera la
-- app (cuid de Prisma en el back-office, `crypto.randomUUID()` en el Admin).
--
-- Se aplica con:
--   cd packages/database && node scripts/apply-sql.cjs prisma/sql/20260929-premios.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Mes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_periods (
  id                TEXT PRIMARY KEY,
  -- Primer día del mes. Fecha sin hora: es un mes de calendario de la clínica.
  month             DATE NOT NULL,
  "poolAmount"      NUMERIC(10,2) NOT NULL CHECK ("poolAmount" >= 0),
  -- OPEN mientras corre; CLOSED congela los montos en reward_participants.
  status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  "closedAt"        TIMESTAMP(3),
  "closedByUserId"  TEXT REFERENCES users(id),
  "createdByUserId" TEXT REFERENCES users(id),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_periods_month_key ON reward_periods (month);

-- ── Quién participa ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_participants (
  id          TEXT PRIMARY KEY,
  "periodId"  TEXT NOT NULL REFERENCES reward_periods(id) ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL DEFAULT 'STAFF' CHECK (kind IN ('STAFF', 'MANAGER')),
  -- Congelados al cerrar el mes. NULL mientras está abierto: el número vivo
  -- se calcula, no se guarda.
  "shareAmount"  NUMERIC(10,2),
  "goalsHit"     INT,
  "goalsTotal"   INT,
  "progressPct"  NUMERIC(7,4),
  "payoutAmount" NUMERIC(10,2),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_participants_period_user_key
  ON reward_participants ("periodId", "userId");
CREATE INDEX IF NOT EXISTS reward_participants_user_idx ON reward_participants ("userId");

-- ── Catálogo de logros (C01…C12) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_categories (
  code               TEXT PRIMARY KEY,
  "nameEs"           TEXT NOT NULL,
  "nameEn"           TEXT NOT NULL,
  "pointsNew"        INT NOT NULL DEFAULT 0,
  "pointsExisting"   INT NOT NULL DEFAULT 0,
  -- Pide la fuente del paciente (solo 4 fuentes dan puntos).
  "tracksSource"     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Pide paciente. Reseñas, bugs, eventos e inventario no lo tienen.
  "requiresPatient"  BOOLEAN NOT NULL DEFAULT FALSE,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder"        INT NOT NULL DEFAULT 0,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Las metas del mes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_goals (
  id              TEXT PRIMARY KEY,
  "periodId"      TEXT NOT NULL REFERENCES reward_periods(id) ON DELETE CASCADE,
  "sortOrder"     INT NOT NULL,
  -- CATEGORY: registros verificados de una categoría.
  -- CALLS:    llamadas del teléfono del back-office.
  -- USAGE:    puntos de uso del sistema (la Carrera), con tope diario.
  kind            TEXT NOT NULL CHECK (kind IN ('CATEGORY', 'CALLS', 'USAGE')),
  "categoryCode"  TEXT REFERENCES reward_categories(code),
  -- Con CATEGORY: contar solo pacientes NEW (la meta "Membresías nuevas").
  "onlyNew"       BOOLEAN NOT NULL DEFAULT FALSE,
  target          INT NOT NULL CHECK (target > 0),
  "labelEs"       TEXT NOT NULL,
  "labelEn"       TEXT NOT NULL,
  CHECK ((kind = 'CATEGORY') = ("categoryCode" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_goals_period_order_key
  ON reward_goals ("periodId", "sortOrder");

-- ── Cada logro registrado (las pestañas "Log - …" del Excel) ────────────────
CREATE TABLE IF NOT EXISTS reward_entries (
  id                 TEXT PRIMARY KEY,
  "periodId"         TEXT NOT NULL REFERENCES reward_periods(id) ON DELETE CASCADE,
  "userId"           TEXT NOT NULL REFERENCES users(id),
  "categoryCode"     TEXT NOT NULL REFERENCES reward_categories(code),
  "occurredOn"       DATE NOT NULL,
  "patientId"        TEXT REFERENCES patients(id),
  "clinicId"         TEXT REFERENCES clinics(id),
  -- PERSONAL_REFERRAL, CONVERTED_AT_DESK, REACTIVATION, SAVED_CANCELLATION dan
  -- puntos; MARKETING_WALKIN, ATTORNEY_MVA, EXTERNAL_REFERRAL, ONLINE_BOOKING
  -- se registran igual y valen 0.
  source             TEXT CHECK (source IN (
                       'PERSONAL_REFERRAL', 'CONVERTED_AT_DESK', 'REACTIVATION', 'SAVED_CANCELLATION',
                       'MARKETING_WALKIN', 'ATTORNEY_MVA', 'EXTERNAL_REFERRAL', 'ONLINE_BOOKING')),
  -- Lo decide el sistema (primera visita del paciente), no quien registra.
  "isNewPatient"     BOOLEAN,
  -- Puntos al momento de registrar. Se guardan para que cambiar la tabla de
  -- puntos después no reescriba los meses ya trabajados.
  points             INT NOT NULL DEFAULT 0,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  "reviewedByUserId" TEXT REFERENCES users(id),
  "reviewedAt"       TIMESTAMP(3),
  "rejectReason"     TEXT,
  -- MANUAL: lo cargó el empleado. AUTO: lo detectó el sistema (Fase 2), entra
  -- ya verificado y con `originRef` apuntando al hecho (la cita, el bug).
  origin             TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origin IN ('MANUAL', 'AUTO')),
  "originRef"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS reward_entries_period_user_idx ON reward_entries ("periodId", "userId");
CREATE INDEX IF NOT EXISTS reward_entries_period_status_idx ON reward_entries ("periodId", status);
-- Un mismo hecho automático no se cuenta dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS reward_entries_origin_ref_key
  ON reward_entries ("categoryCode", "originRef") WHERE "originRef" IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  reward_periods, reward_participants, reward_categories, reward_goals, reward_entries
  TO service_role;

-- ── Catálogo inicial: la hoja "Setup" del Excel v4 ──────────────────────────
INSERT INTO reward_categories (code, "nameEs", "nameEn", "pointsNew", "pointsExisting", "tracksSource", "requiresPatient", "sortOrder") VALUES
  ('C01', 'Inscripción de membresía',  'Membership Signup',      50, 25, TRUE,  TRUE,  1),
  ('C02', 'Conversión paciente nuevo', 'New Patient Conversion', 30,  0, TRUE,  TRUE,  2),
  ('C03', 'Referido de paciente',      'Patient Referral',       25, 15, TRUE,  TRUE,  3),
  ('C04', 'Cita salvada',              'Saved Cancellation',     15, 15, FALSE, TRUE,  4),
  ('C05', 'Reactivación',              'Reactivation',           20, 20, FALSE, TRUE,  5),
  ('C06', 'Reseña 5 estrellas',        '5-Star Review',          15, 15, FALSE, FALSE, 6),
  ('C07', 'Venta de suplemento',       'Supplement Sale',         8,  8, FALSE, TRUE,  7),
  ('C08', 'Venta de tienda online',    'Store Sale (online)',    10, 10, FALSE, FALSE, 8),
  ('C09', 'Bug resuelto',              'Bug Report (resolved)',   5,  5, FALSE, FALSE, 9),
  ('C10', 'Promoción / evento',        'Promotion / Event',      15, 15, FALSE, FALSE, 10),
  ('C11', 'Trabajo LM / reporte a abogado', 'LM Work / Lawyer Report', 3, 3, FALSE, TRUE, 11),
  ('C12', 'Reporte de inventario',     'Inventory Report',        3,  3, FALSE, FALSE, 12)
ON CONFLICT (code) DO NOTHING;

-- ── Avance del mes: los conteos crudos de cada participante ────────────────
--
-- Devuelve, por participante:
--   · entries: registros VERIFICADOS por categoría (total y solo NEW) y puntos
--   · pending: cuántos esperan verificación
--   · calls:   llamadas del mes en las que fue el agente
--   · usage:   puntos de uso del mes, ya con el tope diario
--
-- USO DEL SISTEMA — por cada día de la clínica (America/Denver):
--     min(10, floor(minutos activos / 10) + floor(acciones / 5))
-- Minutos y acciones salen de las mismas tablas que `employee_metrics` (la
-- Carrera). Las acciones excluyen lo que no es trabajo del staff: es la lista
-- `NOT_STAFF_WORK` de `packages/database/src/action-families.ts`. Si esa lista
-- cambia, cambiar ESTA también.
--
-- LLAMADAS — las del agente, en cualquier dirección, que no fallaron. Mismo
-- cruce que `employee_metrics`: por `agentUserId`, o por nombre cuando la fila
-- vieja no lo tiene.
CREATE OR REPLACE FUNCTION public.reward_progress(p_period_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH per AS (
  SELECT p.id, p.month,
         (p.month::timestamp AT TIME ZONE 'America/Denver') AS t_from,
         ((p.month + interval '1 month')::timestamp AT TIME ZONE 'America/Denver') AS t_to
  FROM reward_periods p WHERE p.id = p_period_id
), part AS (
  SELECT rp."userId" FROM reward_participants rp WHERE rp."periodId" = p_period_id
), dia_min AS (
  SELECT x."userId", x.dia, sum(bit_count(x.m::bit(64)))::int AS minutos
  FROM (
    SELECT ua."userId", ua."bucketStart",
           (ua."bucketStart" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS dia,
           bit_or(ua."minutesMask") AS m
    FROM user_activity ua, per
    WHERE ua."bucketStart" >= (per.t_from AT TIME ZONE 'UTC') AND ua."bucketStart" < (per.t_to AT TIME ZONE 'UTC')
      AND ua."userId" IN (SELECT "userId" FROM part)
    GROUP BY 1, 2, 3
  ) x
  GROUP BY 1, 2
), dia_acc AS (
  SELECT a."actorUserId" AS "userId",
         (a."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date AS dia,
         count(*)::int AS acciones
  FROM audit_logs a, per
  WHERE a."actorType" = 'HUMAN_USER'
    AND a."createdAt" >= (per.t_from AT TIME ZONE 'UTC') AND a."createdAt" < (per.t_to AT TIME ZONE 'UTC')
    AND a."actorUserId" IN (SELECT "userId" FROM part)
    AND a.action NOT IN (
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
    AND c."createdAt" >= (per.t_from AT TIME ZONE 'UTC') AND c."createdAt" < (per.t_to AT TIME ZONE 'UTC')
    AND c.outcome::text NOT IN ('FAILED')
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
  'usageDays',   coalesce((SELECT dias FROM uso WHERE uso."userId" = pt."userId"), 0)
)), '[]'::jsonb)
FROM part pt;
$$;

GRANT EXECUTE ON FUNCTION public.reward_progress(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reward_progress(text) FROM anon, authenticated, public;

COMMIT;

NOTIFY pgrst, 'reload schema';
