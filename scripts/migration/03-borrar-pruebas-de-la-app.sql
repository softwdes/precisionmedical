-- ════════════════════════════════════════════════════════════════════════════
-- Borrar los registros de PRUEBA creados desde la app durante la migración
--
-- El 2026-09-12, mientras corría la importación, alguien creó desde el
-- back-office tres pacientes de prueba con sus casos, y tres bufetes falsos con
-- los mismos apellidos:
--
--     P-1     Octavia Sinclair    → GM-1      + "Sinclair Pemberton Advocacy"
--     P-2     Lysander Kensington → GM-2      + "Kensington Wakefield Litigation"
--     P-6184  Vivienne Ashcroft   → GM-3357   + "Ashcroft Maritime Law Group"
--
-- Además de ser ruido, **GM-1 y GM-2 le robaron el código a dos casos REALES
-- del v2** que por eso no se importaron. Al liberar esos códigos, re-correr
-- `05-cases.mjs` los recupera.
--
-- Se borra hijo → padre a mano en vez de confiar en el cascade: en esta base el
-- esquema de Prisma y los constraints reales no siempre coinciden (ya pasó con
-- el unique de `appointment_billing`), y un DELETE que falla a mitad deja peor
-- que antes.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/03-borrar-pruebas-de-la-app.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Los tres pacientes de prueba, por código. Si alguno ya no está, no pasa nada.
CREATE TEMP TABLE _pruebas AS
SELECT id FROM patients WHERE "patientCode" IN ('P-1', 'P-2', 'P-6184');

CREATE TEMP TABLE _casos AS
SELECT id FROM cases WHERE "patientId" IN (SELECT id FROM _pruebas);

CREATE TEMP TABLE _citas AS
SELECT id FROM appointments WHERE "caseId" IN (SELECT id FROM _casos);

-- ─── De la cita para abajo ──────────────────────────────────────────────────
DELETE FROM billing_payments      WHERE "billingId" IN (SELECT id FROM appointment_billing WHERE "appointmentId" IN (SELECT id FROM _citas));
DELETE FROM appointment_billing   WHERE "appointmentId" IN (SELECT id FROM _citas) OR "caseId" IN (SELECT id FROM _casos);
DELETE FROM visit_note_diagnoses  WHERE "noteId" IN (SELECT id FROM visit_notes WHERE "appointmentId" IN (SELECT id FROM _citas));
DELETE FROM visit_service_codes   WHERE "visitNoteId" IN (SELECT id FROM visit_notes WHERE "appointmentId" IN (SELECT id FROM _citas));
DELETE FROM visit_notes           WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM triage_records        WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM lab_orders            WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM prescriptions         WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM appointment_braces    WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM appointment_services  WHERE "appointmentId" IN (SELECT id FROM _citas);
DELETE FROM appointments          WHERE id IN (SELECT id FROM _citas);

-- ─── Del caso para abajo ────────────────────────────────────────────────────
DELETE FROM case_consents         WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_auto_insurances  WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_adjusters        WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_legal_assistants WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_managers         WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_notes            WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_tracking_notes   WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM case_tracking         WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM lien_signatures       WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM authorized_dependents WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM intake_submissions    WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM patient_documents     WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM message_logs          WHERE "caseId" IN (SELECT id FROM _casos);
DELETE FROM cases                 WHERE id IN (SELECT id FROM _casos);

-- ─── Del paciente ───────────────────────────────────────────────────────────
DELETE FROM patient_documents     WHERE "patientId" IN (SELECT id FROM _pruebas);
DELETE FROM message_logs          WHERE "patientId" IN (SELECT id FROM _pruebas);
DELETE FROM message_threads       WHERE "patientId" IN (SELECT id FROM _pruebas);
DELETE FROM call_logs             WHERE "patientId" IN (SELECT id FROM _pruebas);
DELETE FROM patients              WHERE id IN (SELECT id FROM _pruebas);

-- ─── Los tres bufetes inventados (sin casos ni miembros) ────────────────────
DELETE FROM lawyers
 WHERE "entityType" = 'FIRM'
   AND "firmName" IN ('Sinclair Pemberton Advocacy',
                      'Kensington Wakefield Litigation',
                      'Ashcroft Maritime Law Group')
   AND NOT EXISTS (SELECT 1 FROM cases   c WHERE c."lawFirmId"    = lawyers.id)
   AND NOT EXISTS (SELECT 1 FROM lawyers m WHERE m."parentFirmId" = lawyers.id);

COMMIT;

-- Después: `node 05-cases.mjs` recupera los dos casos reales que usaban
-- los códigos GM-1 y GM-2, y `node 06-appointments.mjs` sus citas.
