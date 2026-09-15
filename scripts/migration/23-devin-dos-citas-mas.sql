-- ════════════════════════════════════════════════════════════════════════════
-- Dos citas más para Devin, hoy, con DOS pacientes de prueba distintos
--
-- Pedido de Erick 2026-09-15. Las cuatro de 19-devin-pruebas.sql siguen vivas
-- pero Devin ya las movió a octubre y les cambió el estado —que es para lo que
-- estaban—, así que hoy le quedaba una sola: la de las 8:30 con "Erick Paciente
-- de Prueba", que además está IN_PROGRESS.
--
-- ── Por qué DOS pacientes distintos y no el mismo ──────────────────────────
-- Con un solo paciente no se puede ver si la pantalla mezcla datos entre citas:
-- todo coincide por casualidad. Dos pacientes distintos en la misma agenda es
-- lo que hace visible un cruce.
--
--   14:00 Utah  prueba 81        (P-6184) · caso GM-3357
--   15:00 Utah  prueba82 prueba  (P-6185) · caso GM-3358
--
-- ⚠️ LA HORA VA EN UTC. `scheduledFor` es `timestamp without time zone` y la app
-- la lee como UTC, así que 14:00 de Utah se escribe 20:00 y 15:00 se escribe
-- 21:00 (UTC-6 en septiembre). Verificado contra los datos, no deducido.
-- Comprobado también que Devin no tiene nada en esa franja y que las dos horas
-- caen dentro del horario de atención (08:00-18:00).
--
-- ⚠️ El `id` va explícito: `appointments.id` NO tiene default en la base y un
-- INSERT que lo omita falla. `updatedAt` tampoco.
--
-- ── Bonus: sirven para verificar el arreglo de hoy ─────────────────────────
-- Los dos casos son GM (`caseType = GENERAL`), así que con el arreglo de hoy
-- —el tipo de cita sale del caso, y la inferencia pasó a mirar `caseType` en vez
-- de `accidentType`, que estaba vacío en el 96% de los casos— estas dos citas
-- tienen que pintarse VERDES en el calendario. Si salen rosas, la inferencia
-- sigue rota. Es la prueba más barata que hay de ese cambio.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/23-devin-dos-citas-mas.sql
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO appointments (
  id, "patientId", "caseId", "clinicId", "providerId",
  "scheduledFor", "durationMinutes", type, status, notes,
  "createdAt", "updatedAt"
)
SELECT
  v.id, v.paciente, v.caso,
  'cmrbhnhav00024mbpm5qtpf0g',    -- clínica  Provo
  'cms918xnx0002t79anlfh1rd5',    -- provider Devin Clanton
  v.cuando, 30,
  'FAMILY_PRACTICE',              -- los dos casos son GM
  'SCHEDULED',
  'Cita de prueba para Devin — creada por SQL el 2026-09-15.',
  now() AT TIME ZONE 'UTC',
  now() AT TIME ZONE 'UTC'
FROM (VALUES
  ('devtest-devin-20260915-1400',
   'cmu153p4q0002qhgnq5920wrv',          -- prueba 81      (P-6184)
   'cmu153p630004qhgnyrfqel7x',          -- caso GM-3357
   TIMESTAMP '2026-09-15 20:00:00'),     -- 14:00 Utah
  ('devtest-devin-20260915-1500',
   'cmu156bac0008oxexky7pnc2l',          -- prueba82 prueba (P-6185)
   'cmu156bba000aoxex97hj3bru',          -- caso GM-3358
   TIMESTAMP '2026-09-15 21:00:00')      -- 15:00 Utah
) AS v(id, paciente, caso, cuando)
ON CONFLICT (id) DO NOTHING;

-- ── Verificación ────────────────────────────────────────────────────────────
-- SELECT TO_CHAR(a."scheduledFor" - interval '6 hours','MM-DD HH24:MI') AS utah,
--        p."firstName" || ' ' || p."lastName" AS paciente, cs."caseCode", a.status::text
--   FROM appointments a
--   JOIN patients p ON p.id = a."patientId"
--   LEFT JOIN cases cs ON cs.id = a."caseId"
--  WHERE a.id LIKE 'devtest-devin-2026091%' ORDER BY a."scheduledFor";

-- ── Para borrar TODAS las de prueba de Devin cuando termine ─────────────────
-- DELETE FROM appointments WHERE id LIKE 'devtest-devin-%';
