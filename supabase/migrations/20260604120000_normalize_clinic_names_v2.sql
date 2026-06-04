-- ─────────────────────────────────────────────────────────────────────────
-- Segunda normalizacion de work_schedules.clinic_name → match con clinics.name
-- ─────────────────────────────────────────────────────────────────────────
-- La primera (20260528140000_normalize_clinic_names) arreglo los nombres
-- legacy pero solo cubrio 'Provo' → 'Provo Clinic'. El form del admin
-- (apps/web/app/(admin)/dashboard/employees/horarios-client.tsx) seguia
-- guardando todos los nombres US SIN el sufijo " Clinic" — entonces cada
-- empleado US nuevo creado entre 2026-05-28 y 2026-06-04 quedo con
-- work_schedules.clinic_name roto.
--
-- Sintoma del bug: empleado abre el timeclock, ve "Pleasant Grove Clinic"
-- por default (primera US alfabetica) en vez de su clinica real, porque
-- el <select value="Provo"> no encuentra <option value="Provo"> y el
-- browser cae automaticamente en la primera opcion no-disabled.
--
-- Esta migration normaliza los 5 nombres US a su forma canonica.
-- BO/PE NO se tocan — ya estaban correctos.

UPDATE public.work_schedules
SET clinic_name = CASE clinic_name
  WHEN 'Provo'          THEN 'Provo Clinic'
  WHEN 'Pleasant Grove' THEN 'Pleasant Grove Clinic'
  WHEN 'Spanish Fork'   THEN 'Spanish Fork Clinic'
  WHEN 'West Valley'    THEN 'West Valley Clinic'
  WHEN 'South Murray'   THEN 'South Murray Clinic'
  ELSE clinic_name
END
WHERE clinic_name IN (
  'Provo',
  'Pleasant Grove',
  'Spanish Fork',
  'West Valley',
  'South Murray'
);

-- Tambien normalizamos los attendance_records viejos por si algun empleado
-- alcanzo a marcar entrada con el nombre roto (defensa en profundidad).
UPDATE public.attendance_records
SET clinic_name = CASE clinic_name
  WHEN 'Provo'          THEN 'Provo Clinic'
  WHEN 'Pleasant Grove' THEN 'Pleasant Grove Clinic'
  WHEN 'Spanish Fork'   THEN 'Spanish Fork Clinic'
  WHEN 'West Valley'    THEN 'West Valley Clinic'
  WHEN 'South Murray'   THEN 'South Murray Clinic'
  ELSE clinic_name
END
WHERE clinic_name IN (
  'Provo',
  'Pleasant Grove',
  'Spanish Fork',
  'West Valley',
  'South Murray'
);

NOTIFY pgrst, 'reload schema';
