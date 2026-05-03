-- GOALS (Objetivos de entrenamiento)
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage goals" ON goals;
CREATE POLICY "Authenticated users can manage goals" ON goals
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

INSERT INTO goals (value, label, sort_order) VALUES
  ('hypertrophy', 'Hipertrofia', 0),
  ('strength', 'Fuerza', 1),
  ('fat_loss', 'Pérdida de Grasa', 2),
  ('endurance', 'Resistencia', 3)
ON CONFLICT (value) DO NOTHING;

-- EXERCISES (Biblioteca de ejercicios)
CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  muscle_group text NOT NULL,
  focus_type text NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage exercises" ON exercises;
CREATE POLICY "Authenticated users can manage exercises" ON exercises
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
