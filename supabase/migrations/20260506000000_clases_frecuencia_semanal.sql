-- Allow 'semanal' as a valid frecuencia_tipo for recurring classes
ALTER TABLE clases DROP CONSTRAINT IF EXISTS clases_frecuencia_tipo_check;
ALTER TABLE clases ADD CONSTRAINT clases_frecuencia_tipo_check
  CHECK (frecuencia_tipo IN ('diario', 'interdiario', 'semanal'));
