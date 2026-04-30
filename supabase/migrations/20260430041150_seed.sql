-- ============================================
-- SEED DATA - Compatible with existing schema
-- ============================================

-- Permitir user_id nullable para desarrollo
ALTER TABLE trainers ALTER COLUMN user_id DROP NOT NULL;

-- Trainer de prueba (sin user_id para desarrollo)
INSERT INTO trainers (id, user_id, business_name, slug, subscription_status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'Coach Carlos M.',
  'carlos-trainer',
  'active'
) ON CONFLICT (slug) DO NOTHING;

-- Alumnos de prueba
INSERT INTO students (id, trainer_id, full_name, experience_level, goals, available_equipment)
VALUES
(
  '22222222-2222-2222-2222-222222222221',
  '11111111-1111-1111-1111-111111111111',
  'María López',
  'intermediate',
  ARRAY['hypertrophy', 'fat_loss'],
  'full_gym'
),
(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Diego Ramos',
  'advanced',
  ARRAY['strength'],
  'full_gym'
),
(
  '22222222-2222-2222-2222-222222222223',
  '11111111-1111-1111-1111-111111111111',
  'Ana Torres',
  'beginner',
  ARRAY['fat_loss'],
  'home_basic'
),
(
  '22222222-2222-2222-2222-222222222224',
  '11111111-1111-1111-1111-111111111111',
  'Pedro García',
  'intermediate',
  ARRAY['hypertrophy'],
  'full_gym'
),
(
  '22222222-2222-2222-2222-222222222225',
  '11111111-1111-1111-1111-111111111111',
  'Sofia Mendoza',
  'beginner',
  ARRAY['fat_loss'],
  'bodyweight'
) ON CONFLICT DO NOTHING;

-- Métricas corporales
INSERT INTO body_metrics (student_id, weight_kg, body_fat_pct, muscle_mass_kg, measured_at)
VALUES
(
  '22222222-2222-2222-2222-222222222221',
  65.5,
  22.0,
  28.5,
  NOW() - INTERVAL '7 days'
),
(
  '22222222-2222-2222-2222-222222222222',
  85.0,
  15.0,
  40.2,
  NOW() - INTERVAL '3 days'
),
(
  '22222222-2222-2222-2222-222222222223',
  72.0,
  28.0,
  30.0,
  NOW() - INTERVAL '1 day'
);

-- Paquetes de sesiones
INSERT INTO session_packages (student_id, total_sessions, used_sessions, amount, purchased_on, expires_on)
VALUES
(
  '22222222-2222-2222-2222-222222222221',
  10,
  3,
  350.00,
  NOW() - INTERVAL '30 days',
  NOW() + INTERVAL '60 days'
),
(
  '22222222-2222-2222-2222-222222222222',
  20,
  18,
  600.00,
  NOW() - INTERVAL '60 days',
  NOW() + INTERVAL '90 days'
),
(
  '22222222-2222-2222-2222-222222222223',
  5,
  0,
  200.00,
  NOW() - INTERVAL '10 days',
  NOW() + INTERVAL '30 days'
);

-- Plantillas de rutinas
INSERT INTO routine_templates (trainer_id, name, goal, payload)
VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'Hipertrofia Full Body',
  'hypertrophy',
  '{"exercises": [{"name": "Press banca", "sets": 4, "reps": "8-10"}, {"name": "Sentadilla", "sets": 4, "reps": "8-10"}]}'::jsonb
),
(
  '11111111-1111-1111-1111-111111111111',
  'Pérdida de Grasa',
  'fat_loss',
  '{"exercises": [{"name": "Burpees", "sets": 4, "reps": "15"}, {"name": "Mountain climbers", "sets": 4, "reps": "20"}]}'::jsonb
),
(
  '11111111-1111-1111-1111-111111111111',
  'Fuerza Powerlifting',
  'strength',
  '{"exercises": [{"name": "Press banca", "sets": 5, "reps": "5"}, {"name": "Sentadilla", "sets": 5, "reps": "5"}]}'::jsonb
);

-- Disponibilidad del trainer
INSERT INTO trainer_availability (trainer_id, starts_at, ends_at, block_type, capacity, session_duration_min)
VALUES
(
  '11111111-1111-1111-1111-111111111111',
  CURRENT_DATE + INTERVAL '1 day' + INTERVAL '7 hours',
  CURRENT_DATE + INTERVAL '1 day' + INTERVAL '8 hours',
  'available',
  1,
  60
),
(
  '11111111-1111-1111-1111-111111111111',
  CURRENT_DATE + INTERVAL '1 day' + INTERVAL '9 hours',
  CURRENT_DATE + INTERVAL '1 day' + INTERVAL '10 hours',
  'available',
  1,
  60
),
(
  '11111111-1111-1111-1111-111111111111',
  CURRENT_DATE + INTERVAL '2 days' + INTERVAL '17 hours',
  CURRENT_DATE + INTERVAL '2 days' + INTERVAL '19 hours',
  'available',
  1,
  60
);

-- Records personales
INSERT INTO personal_records (student_id, exercise_name, weight_kg, reps, achieved_on)
VALUES
(
  '22222222-2222-2222-2222-222222222221',
  'Press banca',
  65,
  8,
  CURRENT_DATE - INTERVAL '10 days'
),
(
  '22222222-2222-2222-2222-222222222222',
  'Sentadilla',
  120,
  5,
  CURRENT_DATE - INTERVAL '5 days'
),
(
  '22222222-2222-2222-2222-222222222222',
  'Peso muerto',
  140,
  3,
  CURRENT_DATE - INTERVAL '15 days'
);