CREATE TABLE IF NOT EXISTS clases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  tipo text NOT NULL DEFAULT 'personal' CHECK (tipo IN ('personal','grupal','evaluacion','bloque')),
  color text NOT NULL DEFAULT 'green' CHECK (color IN ('green','blue','purple','amber','coral')),
  recurrencia text NOT NULL DEFAULT 'ninguna' CHECK (recurrencia IN ('ninguna','rango','frecuencia')),
  fecha_hasta date,
  frecuencia_tipo text CHECK (frecuencia_tipo IN ('diario','interdiario')),
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clase_alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id uuid NOT NULL REFERENCES clases(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE(clase_id, alumno_id)
);

ALTER TABLE clases ENABLE ROW LEVEL SECURITY;
ALTER TABLE clase_alumnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clases_select" ON clases FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "clases_insert" ON clases FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "clases_update" ON clases FOR UPDATE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
CREATE POLICY "clases_delete" ON clases FOR DELETE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "clase_alumnos_select" ON clase_alumnos FOR SELECT USING (
  clase_id IN (SELECT id FROM clases WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "clase_alumnos_insert" ON clase_alumnos FOR INSERT WITH CHECK (
  clase_id IN (SELECT id FROM clases WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "clase_alumnos_delete" ON clase_alumnos FOR DELETE USING (
  clase_id IN (SELECT id FROM clases WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
