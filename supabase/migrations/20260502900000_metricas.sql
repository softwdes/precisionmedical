-- ── Métricas: nuevas tablas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sesiones_entrenamiento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rutina_dia_id uuid REFERENCES rutina_dias(id) ON DELETE SET NULL,
  fecha         date NOT NULL DEFAULT CURRENT_DATE,
  completada    boolean DEFAULT false,
  notas         text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE sesiones_entrenamiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_sesiones" ON sesiones_entrenamiento;
CREATE POLICY "trainer_own_sesiones" ON sesiones_entrenamiento FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS progreso_ejercicio (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ejercicio_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  fecha        date NOT NULL DEFAULT CURRENT_DATE,
  peso_kg      numeric(7,2),
  reps         integer,
  sets         integer,
  notas        text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE progreso_ejercicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_progreso" ON progreso_ejercicio;
CREATE POLICY "trainer_own_progreso" ON progreso_ejercicio FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS medidas_corporales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  pecho_cm   numeric(5,1),
  cintura_cm numeric(5,1),
  cadera_cm  numeric(5,1),
  biceps_cm  numeric(5,1),
  muslo_cm   numeric(5,1),
  notas      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE medidas_corporales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_medidas" ON medidas_corporales;
CREATE POLICY "trainer_own_medidas" ON medidas_corporales FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS logros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tipo           text NOT NULL,
  titulo         text NOT NULL,
  descripcion    text,
  fecha_obtenido date DEFAULT CURRENT_DATE,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE logros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_logros" ON logros;
CREATE POLICY "trainer_own_logros" ON logros FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));
