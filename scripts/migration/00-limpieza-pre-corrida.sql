-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza previa a la corrida real v2 → v3   ·   escrito 2026-09-11
--
-- QUÉ HACE: deja la base Phoenix (kiqlh…) sin UN SOLO dato de paciente, caso,
-- cita, nota, documento, factura ni mensaje, y conserva TODO lo que no vuelve
-- en los Excel: cuentas, catálogos, plantillas, snippets, configuración y las
-- 6 clínicas reales.
--
-- ⚠️ NO CORRER A CIEGAS. Antes:
--   1. Confirmar que el DATABASE_URL apunta a kiqlhwncfqfftaqqvadj (Phoenix) y
--      NO a ztyahz… (Admin: ahí viven las cuentas, se rompe el login de todos).
--   2. Respaldo: Supabase → Database → Backups, o pg_dump.
--   3. Decidir los dos bloques marcados OPCIONAL (§4).
--
-- Cómo se aplica (el pooler no acepta `prisma db execute`):
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/00-limpieza-pre-corrida.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Datos transaccionales ──────────────────────────────────────────────
-- Un solo TRUNCATE: Postgres resuelve el orden entre las tablas listadas y
-- FALLA si falta alguna que apunte a otra de la lista. Esa falla es la red de
-- seguridad: significa "te olvidaste una tabla", no "el script está mal".
-- Deliberadamente SIN `CASCADE`, que vaciaría en silencio tablas no listadas.

TRUNCATE TABLE
  -- visita y clínica
  visit_note_diagnoses, visit_service_codes, appointment_braces,
  appointment_services, lab_orders, lab_requisitions, prescriptions,
  triage_records, visit_notes,
  -- dinero por visita
  billing_payments, appointment_billing,
  -- agenda
  appointments,
  -- caso
  case_consents, case_notes, case_tracking_notes, case_tracking,
  case_adjusters, case_auto_insurances, case_legal_assistants, case_managers,
  authorized_dependents, lien_signatures, intake_submissions,
  patient_documents, cases,
  -- paciente
  patients,
  -- mensajería (hilos de prueba; las 2 plantillas son "Testing 001"/"QA Test")
  message_attachments, message_entries, message_recipients, message_drafts,
  firm_referrals, message_threads, message_logs, message_templates,
  -- legal: vuelve entero de los Excel (companies + users_extern)
  lawyers, commission_configs, commissions,
  -- seguros: vuelven de los Excel (943 aseguradoras en la corrida anterior)
  insurance_adjusters, insurance_carriers,
  -- operación y telemetría de la prueba
  call_logs, call_agent_presence, notifications, tasks,
  agent_actions, agent_conversations,
  cash_transactions, cash_boxes, provider_time_blocks, metric_snapshots,
  -- bitácora y pulso del equipo (decisión de Erick, 2026-09-11: se borran las
  -- dos, para arrancar el día de la migración con la bitácora HIPAA limpia).
  -- Solo apuntan a `users`, que no se toca.
  audit_logs, user_activity
RESTART IDENTITY;

-- ─── 2. Clínicas: quedan solo las 6 reales ─────────────────────────────────
-- Las reales son las que migró el script 01 (ids cmrbhn…, todas con
-- scriptsurePracticeId 6907): Murray, Murray - Surgery, West Valley, Provo,
-- Pleasant Grove, Spanish Fork. Las otras ~91 son demo de agosto/septiembre
-- (teléfonos 555, Miami/Austin/Seattle…).
DELETE FROM clinics WHERE id NOT LIKE 'cmrbhn%';

-- ─── 3. Verificación (debe dar 0 en todo menos clinics=6) ──────────────────
-- SELECT 'patients' t, count(*) FROM patients
-- UNION ALL SELECT 'cases', count(*) FROM cases
-- UNION ALL SELECT 'appointments', count(*) FROM appointments
-- UNION ALL SELECT 'lawyers', count(*) FROM lawyers
-- UNION ALL SELECT 'patient_documents', count(*) FROM patient_documents
-- UNION ALL SELECT 'clinics (=6)', count(*) FROM clinics;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Decidido por Erick el 2026-09-11 — queda escrito para que nadie lo revierta
-- ════════════════════════════════════════════════════════════════════════════
-- · `audit_logs` y `user_activity`: SE BORRAN (ya están en el TRUNCATE de §1).
-- · `lawyers`: se borra TODO — las 15 fichas reales del v2 también — y el
--   catálogo se rearma desde los Excel (companies + users_extern). Eso obliga a
--   escribir `03b-companies.mjs`: hoy NO existe ningún script que inserte los
--   bufetes, y `07b`/`09` solo vinculan por nombre contra lo que ya exista.
--   Ver docs/plan-limpieza-y-cableado-v3.md §3.13.
-- · Los 12 providers de prueba SE CONSERVAN: son las cuentas con las que QA
--   entra al portal médico. NO correr un archivado masivo sobre ellos.
