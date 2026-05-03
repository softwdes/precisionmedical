-- ============================================
-- PRECISION TRAINER - DATABASE SCHEMA
-- ============================================

-- 1. TRAINERS (Perfiles de trainers)
-- ================================
CREATE TABLE IF NOT EXISTS trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  subscription_expires_at TIMESTAMPTZ,
  max_students INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. STUDENTS (Alumnos)
-- ================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  birth_date DATE,
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  goals TEXT[], -- ['hypertrophy', 'fat_loss', 'strength', 'endurance']
  available_equipment TEXT CHECK (available_equipment IN ('full_gym', 'home_basic', 'bodyweight')),
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BODY METRICS (Métricas corporales)
-- ================================
CREATE TABLE IF NOT EXISTS body_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weight_kg DECIMAL(5,2),
  body_fat_percent DECIMAL(4,1),
  muscle_mass_kg DECIMAL(5,2),
  measured_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SESSION PACKAGES (Paquetes de sesiones)
-- ================================
CREATE TABLE IF NOT EXISTS session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL DEFAULT 1,
  used_sessions INTEGER DEFAULT 0,
  price_paid DECIMAL(10,2),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROUTINE TEMPLATES (Plantillas de rutinas)
-- ================================
CREATE TABLE IF NOT EXISTS routine_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT, -- 'hypertrophy', 'strength', 'fat_loss', etc.
  description TEXT,
  exercises JSONB, -- Array of exercise definitions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. STUDENT ROUTINES (Rutinas asignadas a estudiantes)
-- ================================
CREATE TABLE IF NOT EXISTS student_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  exercises JSONB NOT NULL, -- Full routine with exercises
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ROUTINE SESSIONS (Sesiones individuales de rutinas)
-- ================================
CREATE TABLE IF NOT EXISTS routine_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_routine_id UUID NOT NULL REFERENCES student_routines(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRAINER AVAILABILITY (Disponibilidad del trainer)
-- ================================
CREATE TABLE IF NOT EXISTS trainer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'available', -- available | personal | break | meal
  capacity INTEGER DEFAULT 1,
  session_duration_min INTEGER DEFAULT 60,
  gym_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. GYMS (Gimnasios de referencia)
-- ================================
CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BOOKINGS (Reservas)
-- ================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_availability_id UUID NOT NULL REFERENCES trainer_availability(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'reserved', -- reserved | confirmed | cancelled | no_show | attended
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trainer_availability_id, student_id)
);

-- 11. BOOKING WAITLIST (Lista de espera)
-- ================================
CREATE TABLE IF NOT EXISTS booking_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_availability_id UUID NOT NULL REFERENCES trainer_availability(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'expired'))
);

-- 11. EXERCISE LOGS (Registro de ejercicios)
-- ================================
CREATE TABLE IF NOT EXISTS exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_session_id UUID REFERENCES routine_sessions(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight_kg DECIMAL(5,2),
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PERSONAL RECORDS (Récords personales)
-- ================================
CREATE TABLE IF NOT EXISTS personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  reps INTEGER NOT NULL,
  achieved_on DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, exercise_name)
);

-- 13. PROGRESS PHOTOS (Fotos de progreso)
-- ================================
CREATE TABLE IF NOT EXISTS progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SUBSCRIPTION PAYMENTS (Pagos de suscripción - Master)
-- ================================
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  paid_on TIMESTAMPTZ DEFAULT NOW(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_method TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. ACTIVITY LOG (Registro de actividad)
-- ================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. SUPPORT TICKETS (Tickets de soporte - Master)
-- ================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ============================================

-- Students
CREATE INDEX IF NOT EXISTS idx_students_trainer ON students(trainer_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_trainer_created ON students(trainer_id, created_at DESC);

-- Body Metrics
CREATE INDEX IF NOT EXISTS idx_body_metrics_student ON body_metrics(student_id, measured_at DESC);

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_availability ON bookings(trainer_availability_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reserved ON bookings(reserved_at DESC);

-- Trainer Availability
CREATE INDEX IF NOT EXISTS idx_availability_trainer_dates ON trainer_availability(trainer_id, starts_at, ends_at);

-- Exercise Logs
CREATE INDEX IF NOT EXISTS idx_exercise_logs_student ON exercise_logs(student_id, completed_at DESC);

-- Personal Records
CREATE INDEX IF NOT EXISTS idx_pr_student ON personal_records(student_id);

-- Activity Log
CREATE INDEX IF NOT EXISTS idx_activity_trainer ON activity_log(trainer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_student ON activity_log(student_id, created_at DESC);

-- ============================================
-- POLÍTICAS RLS (SEGURIDAD)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- TRAINERS: El trainer puede ver su propio perfil
CREATE POLICY "trainers_self" ON trainers
  FOR SELECT USING (auth.uid() = user_id);

-- STUDENTS: Solo el trainer puede ver sus alumnos
CREATE POLICY "students_trainer" ON students
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- BODY METRICS: Solo el trainer del alumno puede ver métricas
CREATE POLICY "body_metrics_trainer" ON body_metrics
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

-- SESSION PACKAGES: Solo el trainer del alumno puede ver paquetes
CREATE POLICY "session_packages_trainer" ON session_packages
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

-- ROUTINE TEMPLATES: Solo el trainer puede ver sus plantillas
CREATE POLICY "routine_templates_trainer" ON routine_templates
  FOR ALL USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

-- STUDENT ROUTINES: Solo el trainer puede ver rutinas de sus alumnos
CREATE POLICY "student_routines_trainer" ON student_routines
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- TRAINER AVAILABILITY: Solo el trainer puede ver su disponibilidad
CREATE POLICY "availability_trainer" ON trainer_availability
  FOR ALL USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

-- BOOKINGS: Solo el trainer puede ver reservas de sus alumnos
CREATE POLICY "bookings_trainer" ON bookings
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

-- EXERCISE LOGS: Trainer puede ver logs de sus alumnos
CREATE POLICY "exercise_logs_trainer" ON exercise_logs
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

-- PERSONAL RECORDS: Trainer puede ver PRs de sus alumnos
CREATE POLICY "personal_records_trainer" ON personal_records
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

-- GYMS: Cualquier usuario autenticado puede ver los gimnasios
CREATE POLICY "gyms_read" ON gyms FOR SELECT USING (auth.role() = 'authenticated');

-- MASTER: Acceso completo a subscription_payments, activity_log, support_tickets
CREATE POLICY "master_all" ON subscription_payments FOR ALL USING (true);
CREATE POLICY "master_all_activity" ON activity_log FOR ALL USING (true);
CREATE POLICY "master_all_tickets" ON support_tickets FOR ALL USING (true);

-- Seed data for gyms
INSERT INTO gyms (name) VALUES
  ('Gilmar Gym'), ('Revo Sport'), ('Imperium Center'), ('Smart Fit'),
  ('Bodytech'), ('Millenium Gym'), ('Strong Gym'), ('Murdock Gym'), ('Otro')
ON CONFLICT (name) DO NOTHING;