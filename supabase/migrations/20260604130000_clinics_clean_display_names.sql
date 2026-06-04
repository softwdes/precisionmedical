-- ─────────────────────────────────────────────────────────────────────────
-- Limpieza de display_name para clinicas US — quitar sufijo " Clinic"
-- ─────────────────────────────────────────────────────────────────────────
-- Pedido del super admin: la tabla de Configuracion → Clinicas mostraba
-- "Provo Clinic", "Pleasant Grove Clinic", etc. con sufijo redundante.
-- El `name` (clave interna usada en JOINs) sigue con sufijo — INMUTABLE
-- post-creacion porque work_schedules.clinic_name y attendance_records
-- referencian ese valor exacto. Solo cambiamos el `display_name` que es
-- el texto bonito que se muestra al usuario.
--
-- Resultado: el admin tab muestra "Provo" + "key: Provo Clinic" debajo
-- (la tabla ya tiene logica para mostrar el name cuando difiere del
-- display_name). El timeclock muestra "Provo" en el dropdown. El form
-- de horarios sigue limpio (ya lo estaba gracias al .replace en el hook).
--
-- BO/PE NO se tocan — sus display_names ya eran bonitos:
--   Bolivia → "La Paz, Bolivia"
--   Perú    → "Arequipa, Perú"

UPDATE public.clinics SET display_name = 'Provo'          WHERE name = 'Provo Clinic';
UPDATE public.clinics SET display_name = 'Pleasant Grove' WHERE name = 'Pleasant Grove Clinic';
UPDATE public.clinics SET display_name = 'Spanish Fork'   WHERE name = 'Spanish Fork Clinic';
UPDATE public.clinics SET display_name = 'West Valley'    WHERE name = 'West Valley Clinic';
UPDATE public.clinics SET display_name = 'South Murray'   WHERE name = 'South Murray Clinic';

NOTIFY pgrst, 'reload schema';
