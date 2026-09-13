-- Clínicas de prueba creadas por las corridas E2E del equipo (prefijo "E2E…",
-- ciudades Boston/Houston/Seattle y los mismos apellidos inventados que los
-- pacientes de prueba). Ninguna tiene citas ni bloqueos de agenda.
--
-- Se borran por nombre y solo si están vacías: una clínica con una cita real
-- colgando no se toca ni por accidente.
DELETE FROM clinics c
 WHERE c.name LIKE 'E2E%'
   AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a."clinicId" = c.id)
   AND NOT EXISTS (SELECT 1 FROM provider_time_blocks t WHERE t."clinicId" = c.id);
