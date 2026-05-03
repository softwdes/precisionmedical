-- ── Extend exercises table ────────────────────────────────────────────────────
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS nivel_dificultad integer DEFAULT 3;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS url_video text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- ── Nutrition tables ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alumnos_datos_fisicos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id        uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  peso_kg          numeric(5,2),
  altura_cm        numeric(5,1),
  edad             integer,
  sexo             char(1) CHECK (sexo IN ('m','f')),
  nivel_actividad  text CHECK (nivel_actividad IN ('sedentario','ligero','moderado','activo','muy_activo')),
  fecha_registro   date DEFAULT CURRENT_DATE,
  notas            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE alumnos_datos_fisicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_datos_fisicos" ON alumnos_datos_fisicos;
CREATE POLICY "trainer_own_datos_fisicos" ON alumnos_datos_fisicos FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS planes_nutricionales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id             uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  objetivo_nutricional  text,
  distribucion_macros   text,
  proteinas_g           numeric(7,2),
  carbos_g              numeric(7,2),
  grasas_g              numeric(7,2),
  calorias_meta         numeric(8,2),
  activo                boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE planes_nutricionales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_planes" ON planes_nutricionales;
CREATE POLICY "trainer_own_planes" ON planes_nutricionales FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS historial_peso (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  peso_kg    numeric(5,2) NOT NULL,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  notas      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE historial_peso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_own_historial_peso" ON historial_peso;
CREATE POLICY "trainer_own_historial_peso" ON historial_peso FOR ALL
  USING  (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students s JOIN trainers t ON t.id=s.trainer_id WHERE s.id=alumno_id AND t.user_id=auth.uid()));

-- ── Seed exercises ────────────────────────────────────────────────────────────
-- Only insert if table is empty
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM exercises LIMIT 1) THEN

INSERT INTO exercises (name, muscle_group, focus_type, equipment, nivel_dificultad) VALUES
-- Pecho
('Press de banca plano',      'Pecho',   'Fuerza',    'Barra, banco',        3),
('Press de banca inclinado',  'Pecho',   'Fuerza',    'Barra, banco',        3),
('Press de banca declinado',  'Pecho',   'Fuerza',    'Barra, banco',        3),
('Aperturas con mancuernas',  'Pecho',   'Fuerza',    'Mancuernas, banco',   2),
('Fondos en paralelas',       'Pecho',   'Fuerza',    'Paralelas',           3),
('Crossover en polea',        'Pecho',   'Fuerza',    'Polea',               2),
('Flexiones',                 'Pecho',   'Fuerza',    'Sin equipamiento',    1),
-- Espalda
('Pull-up/dominadas',         'Espalda', 'Fuerza',    'Barra dominadas',     4),
('Remo con barra',            'Espalda', 'Fuerza',    'Barra',               3),
('Remo con mancuerna',        'Espalda', 'Fuerza',    'Mancuerna, banco',    2),
('Remo en polea baja',        'Espalda', 'Fuerza',    'Polea',               2),
('Jalón al pecho',            'Espalda', 'Fuerza',    'Polea',               2),
('Remo en máquina',           'Espalda', 'Fuerza',    'Máquina',             2),
('Pullover con mancuerna',    'Espalda', 'Fuerza',    'Mancuerna, banco',    2),
('Peso muerto',               'Espalda', 'Fuerza',    'Barra',               5),
('Hiperextensiones',          'Espalda', 'Fuerza',    'Banco romano',        2),
-- Hombros
('Press militar',             'Hombros', 'Fuerza',    'Barra',               3),
('Elevaciones laterales',     'Hombros', 'Fuerza',    'Mancuernas',          2),
('Elevaciones frontales',     'Hombros', 'Fuerza',    'Mancuernas',          2),
('Pájaros',                   'Hombros', 'Fuerza',    'Mancuernas',          2),
('Arnold press',              'Hombros', 'Fuerza',    'Mancuernas',          3),
('Face pull',                 'Hombros', 'Fuerza',    'Polea',               2),
-- Bíceps
('Curl con barra',            'Bíceps',  'Fuerza',    'Barra',               2),
('Curl con mancuernas',       'Bíceps',  'Fuerza',    'Mancuernas',          1),
('Curl martillo',             'Bíceps',  'Fuerza',    'Mancuernas',          1),
('Curl en polea',             'Bíceps',  'Fuerza',    'Polea',               1),
('Curl concentrado',          'Bíceps',  'Fuerza',    'Mancuerna',           1),
('Curl en banco Scott',       'Bíceps',  'Fuerza',    'Barra, banco Scott',  2),
-- Tríceps
('Extensión tríceps polea',   'Tríceps', 'Fuerza',    'Polea',               1),
('Press francés',             'Tríceps', 'Fuerza',    'Barra, banco',        2),
('Patada de tríceps',         'Tríceps', 'Fuerza',    'Mancuerna',           2),
('Fondos en banco',           'Tríceps', 'Fuerza',    'Banco',               1),
('Extensión sobre cabeza',    'Tríceps', 'Fuerza',    'Mancuerna',           2),
-- Piernas
('Sentadilla con barra',      'Piernas', 'Fuerza',    'Barra, rack',         4),
('Sentadilla goblet',         'Piernas', 'Fuerza',    'Mancuerna/kettlebell',2),
('Prensa de piernas',         'Piernas', 'Fuerza',    'Máquina prensa',      2),
('Zancadas',                  'Piernas', 'Fuerza',    'Sin/mancuernas',      2),
('Extensión de cuádriceps',   'Piernas', 'Fuerza',    'Máquina',             1),
('Curl femoral',              'Piernas', 'Fuerza',    'Máquina',             1),
('Sentadilla búlgara',        'Piernas', 'Fuerza',    'Mancuernas, banco',   3),
('Sentadilla sumo',           'Piernas', 'Fuerza',    'Barra',               3),
('Step-up',                   'Piernas', 'Fuerza',    'Banco/cajón',         2),
('Peso muerto rumano',        'Piernas', 'Fuerza',    'Barra',               3),
-- Glúteos
('Hip thrust',                'Glúteos', 'Fuerza',    'Barra, banco',        3),
('Patada de glúteo en máquina','Glúteos','Fuerza',    'Máquina',             1),
('Abducción de cadera',       'Glúteos', 'Fuerza',    'Máquina/banda',       1),
('Glute bridge',              'Glúteos', 'Fuerza',    'Sin equipamiento',    1),
-- Core
('Plancha frontal',           'Core',    'Fuerza',    'Sin equipamiento',    1),
('Plancha lateral',           'Core',    'Fuerza',    'Sin equipamiento',    1),
('Crunch abdominal',          'Core',    'Fuerza',    'Sin equipamiento',    1),
('Crunch en polea',           'Core',    'Fuerza',    'Polea',               2),
('Rueda abdominal',           'Core',    'Fuerza',    'Rueda abdominal',     3),
('Russian twist',             'Core',    'Fuerza',    'Sin/disco',           2),
('Elevación de piernas',      'Core',    'Fuerza',    'Barra dominadas',     2),
('Dead bug',                  'Core',    'Fuerza',    'Sin equipamiento',    2),
('Pallof press',              'Core',    'Fuerza',    'Polea',               2),
-- Cardio / Full Body
('Caminata del granjero',     'Full Body','Fuerza',   'Mancuernas/kettlebell',2),
('Thruster',                  'Full Body','Fuerza',   'Barra/mancuernas',    4),
('Burpee',                    'Full Body','Cardio',   'Sin equipamiento',    3),
('Cinta/trotadora',           'Cardio',  'Cardio',    'Cinta',               1),
('Bicicleta estática',        'Cardio',  'Cardio',    'Bicicleta',           1),
('Saltar soga',               'Cardio',  'Cardio',    'Soga',                2),
('Escalador',                 'Cardio',  'Cardio',    'Sin equipamiento',    2),
('Sprints',                   'Cardio',  'Cardio',    'Sin equipamiento',    3);

END IF;
END $$;
