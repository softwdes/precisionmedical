-- ════════════════════════════════════════════════════════════════════════════
-- Devin Clanton vuelve al selector, y 4 citas para que pruebe
--
-- Pedido de Erick 2026-09-14: Devin pidió volver para hacer pruebas. Hoy quedó
-- INACTIVE en 17-apagar-catalogos-de-prueba.sql (decisión del mismo día: "esos
-- 3 que solo desaparezcan"), así que esto revierte la parte que le toca. Los
-- otros dos —Mark Stouffer y Scott Rigdon— NO se tocan.
--
-- Nada se borró cuando se apagó, así que volver es cambiar el estado: sus 2
-- citas viejas siguen ahí.
--
-- ── Las 4 citas ────────────────────────────────────────────────────────────
--   martes    15-sep-2026  10:00 y 12:00
--   miércoles 16-sep-2026  10:00 y 12:00
--
-- ⚠️ LA HORA VA EN UTC. `scheduledFor` es `timestamp without time zone` y la
-- app la lee como UTC, así que escribir "10:00" guardaría las 4 de la mañana de
-- Utah. Verificado contra los datos, no deducido: las citas de los últimos 30
-- días se agrupan en las horas crudas 14-23, que es la jornada de 8am a 5pm en
-- Denver (UTC-6 en septiembre). Entonces:
--
--       10:00 Denver → 16:00 UTC          12:00 Denver → 18:00 UTC
--
-- Si esto se corre después del cambio de horario (1-nov-2026, Denver pasa a
-- UTC-7), los números dejan de servir: habría que sumar una hora.
--
-- ── El `id` va explícito, y no es opcional ─────────────────────────────────
-- `appointments.id` NO tiene default en la base: el schema se aplicó con
-- `db push` y los `@default(cuid())` de Prisma nunca llegaron a las columnas.
-- Un INSERT que omita el id falla. `updatedAt` tampoco tiene default.
--
-- Los ids llevan el prefijo `devtest` a propósito, para poder borrar las cuatro
-- de un saque cuando Devin termine (la sentencia está al final, comentada).
--
-- ── Paciente elegido ───────────────────────────────────────────────────────
-- "Test Test" (P-6152), caso GM-3322 ACTIVE. Se eligió ese y no los `prueba81`
-- /`prueba82` por una razón concreta: **no tiene teléfono cargado**. Aunque
-- estas citas se insertan por SQL y no disparan el recordatorio por SMS —eso
-- sale sólo por el route de la app—, un paciente sin teléfono no puede recibir
-- un mensaje ni por accidente si mañana alguien las edita desde la pantalla.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/19-devin-pruebas.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Devin vuelve al selector ────────────────────────────────────────────
UPDATE providers
   SET status = 'ACTIVE', "updatedAt" = now() AT TIME ZONE 'UTC'
 WHERE email = 'devin@precisionmedicalcare.com'
   AND "deletedAt" IS NULL;

-- ─── 2. Las 4 citas de prueba ───────────────────────────────────────────────
-- `ON CONFLICT (id) DO NOTHING` para que correr esto dos veces no duplique
-- nada: el id es fijo, así que la segunda corrida no hace nada.
INSERT INTO appointments (
  id, "patientId", "caseId", "clinicId", "providerId",
  "scheduledFor", "durationMinutes", type, status, notes,
  "createdAt", "updatedAt"
)
SELECT
  v.id,
  'cmtyu2znhfqdg2qgbmp',          -- paciente  Test Test (P-6152)
  'cmtyv46d56qtyo6v77a',          -- caso      GM-3322 (ACTIVE)
  'cmrbhnhav00024mbpm5qtpf0g',    -- clínica   Provo
  'cms918xnx0002t79anlfh1rd5',    -- provider  Devin Clanton
  v.cuando,
  30,
  'FAMILY_PRACTICE',              -- el caso es GM, no accidente
  'SCHEDULED',
  'Cita de prueba para Devin — creada por SQL el 2026-09-14.',
  now() AT TIME ZONE 'UTC',
  now() AT TIME ZONE 'UTC'
FROM (VALUES
  ('devtest-devin-20260915-1000', TIMESTAMP '2026-09-15 16:00:00'),  -- mar 10:00 Denver
  ('devtest-devin-20260915-1200', TIMESTAMP '2026-09-15 18:00:00'),  -- mar 12:00 Denver
  ('devtest-devin-20260916-1000', TIMESTAMP '2026-09-16 16:00:00'),  -- mié 10:00 Denver
  ('devtest-devin-20260916-1200', TIMESTAMP '2026-09-16 18:00:00')   -- mié 12:00 Denver
) AS v(id, cuando)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Devin tiene que salir ACTIVE, y las 4 citas en la hora de Utah que se pidió.
--
-- SELECT status FROM providers WHERE email = 'devin@precisionmedicalcare.com';
--
-- SELECT a.id,
--        a."scheduledFor"                               AS guardado_utc,
--        a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver' AS en_utah,
--        a.status, cl.name AS clinica
--   FROM appointments a JOIN clinics cl ON cl.id = a."clinicId"
--  WHERE a.id LIKE 'devtest-devin-%'
--  ORDER BY a."scheduledFor";
--
-- Esperado en la columna `en_utah`:
--   2026-09-15 10:00 · 2026-09-15 12:00 · 2026-09-16 10:00 · 2026-09-16 12:00

-- ── Para borrarlas cuando Devin termine ─────────────────────────────────────
-- DELETE FROM appointments WHERE id LIKE 'devtest-devin-%';
