-- Migrate position field from Spanish labels to enum keys
UPDATE employees
SET position = CASE position
  WHEN 'Doctor'                    THEN 'DOCTOR'
  WHEN 'Enfermero'                 THEN 'NURSE'
  WHEN 'Recepcionista'             THEN 'RECEPTIONIST'
  WHEN 'Desarrollador de Software' THEN 'SOFTWARE_DEVELOPER'
  WHEN 'Administrador de Clínica'  THEN 'CLINIC_ADMIN'
  WHEN 'Asistente Médico'          THEN 'MEDICAL_ASSISTANT'
  WHEN 'Comunicación'              THEN 'COMMUNICATOR'
  WHEN 'Personal de Limpieza'      THEN 'CLEANING_STAFF'
  ELSE position
END
WHERE position IN (
  'Doctor', 'Enfermero', 'Recepcionista', 'Desarrollador de Software',
  'Administrador de Clínica', 'Asistente Médico', 'Comunicación',
  'Personal de Limpieza'
);

-- Add Marketing department if it doesn't exist
INSERT INTO departments (id, name)
VALUES (gen_random_uuid()::text, 'Marketing')
ON CONFLICT (name) DO NOTHING;
