-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ ESTE SCRIPT BORRA. Leer entero antes de correrlo.
--
-- Clínicas de prueba creadas por las corridas de QA del equipo, con todo su
-- rastro: las citas que cuelgan de ellas, los pacientes inventados de esas
-- citas, sus casos y sus órdenes de laboratorio.
--
-- Por qué se borra y no se apaga, al revés que los catálogos de 17-: `clinics`
-- no tiene `isActive` ni `deletedAt`, así que no hay forma de sacarla del
-- selector sin sacarla de la tabla. Y no hay nada real que preservar: las tres
-- filas y todo lo que cuelga de ellas se creó el 2026-09-14 dentro de una
-- corrida de QA.
--
-- ── Qué se borra exactamente (medido 2026-09-14 21:30) ──────────────────────
--   3 clínicas   Aspen Ridge Medical · Liberty Park Health Center · Granite Peak Wellness
--   2 citas      una en Aspen (SCHEDULED) y otra en Liberty (CHECKED_IN); Granite no tiene ninguna
--   2 lab_orders ambas ORDERED, creadas el mismo día, colgando de esas 2 citas
--   2 casos      uno por paciente
--   2 pacientes  Ethan Caldwell y Adelaide Mercer, creados ese día, correos @email.com
--
-- Y se van solos, por CASCADE, cuando se borra la cita:
--   6 appointment_billing
--
-- Sobrevive, por SET NULL, y es a propósito:
--   2 message_logs  quedan con `patientId` en NULL. Son la constancia de que se
--                   mandó un mensaje, no datos del paciente: borrarlos sería
--                   borrar el registro del envío.
--
--   0 notas de visita · 0 recetas · 0 liens · 0 intakes · 0 comisiones ·
--   0 documentos · 0 consentimientos · 0 triajes · 0 membresías ·
--   0 bloqueos de agenda. Verificado tabla por tabla contra la base, no
--   deducido del schema.
--
-- ── Continúa el 05-borrar-clinicas-e2e.sql, que ya no alcanza ───────────────
-- Aquel filtraba por el prefijo "E2E" del nombre. Las corridas nuevas usan
-- nombres de clínica realistas ("Aspen Ridge Medical"), así que el prefijo ya
-- no las agarra y hay que nombrarlas una por una. El origen es el mismo: las
-- cinco las creó mauro.castillo.ing.sis@gmail.com desde la app (audit log,
-- CREATE_CLINIC, 13 y 14 de septiembre).
--
-- ⚠️ La causa NO se arregla acá. Mientras QA siga corriendo contra esta base,
-- van a volver a aparecer. Este script limpia lo de hoy.
--
-- Cada corrida crea el PAQUETE COMPLETO en el mismo minuto: clínica, una
-- especialidad nueva (ver 17-), un paciente con correo @email.com, su caso, su
-- cita y su orden de laboratorio. Las tres corridas del 2026-09-14 fueron a las
-- 17:58, 18:54 y 21:13. La de las 21:13 quedó a medias —creó la clínica y la
-- especialidad, pero no llegó a la cita—, así que puede haber un paciente
-- suelto sin cita que lo delate. Buscarlo antes de dar esto por cerrado:
--
--   SELECT "firstName", "lastName", email, "createdAt" FROM patients
--    WHERE email LIKE '%@email.com' AND "createdAt" > '2026-09-14'
--    ORDER BY "createdAt" DESC;
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/18-borrar-clinicas-de-prueba.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- El alcance se calcula UNA vez y se guarda, porque cada DELETE va borrando las
-- filas de las que se deduce el siguiente: si cada paso volviera a calcularlo,
-- después de borrar las citas ya no habría forma de saber qué pacientes eran.
CREATE TEMP TABLE _cl ON COMMIT DROP AS
  SELECT id FROM clinics
   WHERE name IN ('Aspen Ridge Medical', 'Liberty Park Health Center', 'Granite Peak Wellness');

CREATE TEMP TABLE _ap ON COMMIT DROP AS
  SELECT id, "patientId" FROM appointments WHERE "clinicId" IN (SELECT id FROM _cl);

CREATE TEMP TABLE _pa ON COMMIT DROP AS
  SELECT DISTINCT "patientId" AS id FROM _ap WHERE "patientId" IS NOT NULL;

CREATE TEMP TABLE _ca ON COMMIT DROP AS
  SELECT id FROM cases WHERE "patientId" IN (SELECT id FROM _pa);

-- ─── Cinturón: un paciente con vida propia aborta todo ──────────────────────
-- La única razón por la que borrar estos pacientes es seguro es que su ÚNICA
-- cita es la de la clínica de prueba. Si alguno tuviera además una cita en una
-- sede real, borrarlo se llevaría puesta una visita de verdad. Antes que
-- adivinar, el script se cae y no hace nada.
DO $$
DECLARE extra int;
BEGIN
  SELECT COUNT(*) INTO extra
    FROM appointments a
   WHERE a."patientId" IN (SELECT id FROM _pa)
     AND a.id NOT IN (SELECT id FROM _ap);
  IF extra > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % cita(s) de esos pacientes están fuera de las clínicas de prueba. Revisar a mano antes de borrar.', extra;
  END IF;
END $$;

-- ─── Borrado, de la hoja a la raíz ──────────────────────────────────────────
-- El orden lo imponen las FK RESTRICT: lab_orders antes que appointments,
-- appointments antes que cases y patients, y clinics al final. Lo que cuelga
-- con CASCADE (appointment_services, triage_records, case_consents…) se va solo.

DELETE FROM lab_orders   WHERE "appointmentId" IN (SELECT id FROM _ap);
DELETE FROM appointments WHERE id             IN (SELECT id FROM _ap);
DELETE FROM cases        WHERE id             IN (SELECT id FROM _ca);
DELETE FROM patients     WHERE id             IN (SELECT id FROM _pa);

-- La clínica se borra solo si quedó vacía. Si algo dejó una cita colgando, esta
-- condición la salva en vez de hacer fallar el script con un error de FK.
DELETE FROM clinics c
 WHERE c.id IN (SELECT id FROM _cl)
   AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a."clinicId" = c.id)
   AND NOT EXISTS (SELECT 1 FROM provider_time_blocks t WHERE t."clinicId" = c.id);

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Esperado: 6 filas — Murray, Murray - Surgery, Pleasant Grove, Provo,
-- Spanish Fork, West Valley.
--
-- SELECT name, (SELECT COUNT(*) FROM appointments a WHERE a."clinicId"=c.id) AS citas
--   FROM clinics c ORDER BY name;
