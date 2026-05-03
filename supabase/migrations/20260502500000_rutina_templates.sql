-- rutina_templates
CREATE TABLE IF NOT EXISTS rutina_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id        uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  nivel             text,
  dias_semana       integer NOT NULL DEFAULT 3,
  duracion_semanas  integer NOT NULL DEFAULT 4,
  objetivo          text,
  descripcion       text,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rutina_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_rutina_templates" ON rutina_templates;
CREATE POLICY "trainer_own_rutina_templates" ON rutina_templates FOR ALL
  USING  (trainer_id = (SELECT id FROM trainers WHERE user_id = auth.uid()))
  WITH CHECK (trainer_id = (SELECT id FROM trainers WHERE user_id = auth.uid()));

-- template_dias
CREATE TABLE IF NOT EXISTS template_dias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES rutina_templates(id) ON DELETE CASCADE,
  orden       integer NOT NULL DEFAULT 1,
  nombre      text NOT NULL
);
ALTER TABLE template_dias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_template_dias" ON template_dias;
CREATE POLICY "trainer_own_template_dias" ON template_dias FOR ALL
  USING  (EXISTS (SELECT 1 FROM rutina_templates rt JOIN trainers t ON t.id = rt.trainer_id WHERE rt.id = template_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rutina_templates rt JOIN trainers t ON t.id = rt.trainer_id WHERE rt.id = template_id AND t.user_id = auth.uid()));

-- template_ejercicios
CREATE TABLE IF NOT EXISTS template_ejercicios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_id        uuid NOT NULL REFERENCES template_dias(id) ON DELETE CASCADE,
  orden         integer NOT NULL DEFAULT 1,
  ejercicio_id  uuid REFERENCES exercises(id),
  sets          integer DEFAULT 3,
  reps          text DEFAULT '8-12',
  descanso_seg  integer DEFAULT 90,
  notas         text
);
ALTER TABLE template_ejercicios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_template_ejercicios" ON template_ejercicios;
CREATE POLICY "trainer_own_template_ejercicios" ON template_ejercicios FOR ALL
  USING  (EXISTS (SELECT 1 FROM template_dias td JOIN rutina_templates rt ON rt.id = td.template_id JOIN trainers tr ON tr.id = rt.trainer_id WHERE td.id = dia_id AND tr.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM template_dias td JOIN rutina_templates rt ON rt.id = td.template_id JOIN trainers tr ON tr.id = rt.trainer_id WHERE td.id = dia_id AND tr.user_id = auth.uid()));

-- rutinas_alumno
CREATE TABLE IF NOT EXISTS rutinas_alumno (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  template_id uuid REFERENCES rutina_templates(id),
  nombre      text NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin   date,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rutinas_alumno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_rutinas_alumno" ON rutinas_alumno;
CREATE POLICY "trainer_own_rutinas_alumno" ON rutinas_alumno FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id = s.trainer_id WHERE s.id = alumno_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id = s.trainer_id WHERE s.id = alumno_id AND t.user_id = auth.uid()));

-- rutina_dias
CREATE TABLE IF NOT EXISTS rutina_dias (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rutina_id uuid NOT NULL REFERENCES rutinas_alumno(id) ON DELETE CASCADE,
  orden     integer NOT NULL DEFAULT 1,
  nombre    text NOT NULL
);
ALTER TABLE rutina_dias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_rutina_dias" ON rutina_dias;
CREATE POLICY "trainer_own_rutina_dias" ON rutina_dias FOR ALL
  USING  (EXISTS (SELECT 1 FROM rutinas_alumno ra JOIN students s ON s.id = ra.alumno_id JOIN trainers t ON t.id = s.trainer_id WHERE ra.id = rutina_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rutinas_alumno ra JOIN students s ON s.id = ra.alumno_id JOIN trainers t ON t.id = s.trainer_id WHERE ra.id = rutina_id AND t.user_id = auth.uid()));

-- rutina_ejercicios
CREATE TABLE IF NOT EXISTS rutina_ejercicios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_id        uuid NOT NULL REFERENCES rutina_dias(id) ON DELETE CASCADE,
  orden         integer NOT NULL DEFAULT 1,
  ejercicio_id  uuid REFERENCES exercises(id),
  sets          integer DEFAULT 3,
  reps          text DEFAULT '8-12',
  descanso_seg  integer DEFAULT 90,
  notas         text
);
ALTER TABLE rutina_ejercicios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_rutina_ejercicios" ON rutina_ejercicios;
CREATE POLICY "trainer_own_rutina_ejercicios" ON rutina_ejercicios FOR ALL
  USING  (EXISTS (SELECT 1 FROM rutina_dias rd JOIN rutinas_alumno ra ON ra.id = rd.rutina_id JOIN students s ON s.id = ra.alumno_id JOIN trainers t ON t.id = s.trainer_id WHERE rd.id = dia_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rutina_dias rd JOIN rutinas_alumno ra ON ra.id = rd.rutina_id JOIN students s ON s.id = ra.alumno_id JOIN trainers t ON t.id = s.trainer_id WHERE rd.id = dia_id AND t.user_id = auth.uid()));
