-- ==============================================================================
-- PRECISION TRAINER — SCHEMA COMPLETO
-- Ejecutar en Supabase SQL Editor (una sola vez en base de datos vacía)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- FUNCIÓN HELPER: actualiza updated_at automáticamente
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$func$ language 'plpgsql';

-- ------------------------------------------------------------------------------
-- 1. TRAINERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  business_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  brand_color text,
  bio text,
  specialties text[],
  certifications jsonb DEFAULT '[]'::jsonb,
  subscription_status text DEFAULT 'trialing',
  subscription_started_at timestamptz DEFAULT now(),
  subscription_expires_at timestamptz,
  enabled_modules jsonb DEFAULT '{"biometric": false, "advanced_reports": false, "whatsapp": false, "ai_quota": 50}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_trainers_modtime ON trainers;
CREATE TRIGGER update_trainers_modtime
  BEFORE UPDATE ON trainers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can view own profile" ON trainers;
CREATE POLICY "Trainers can view own profile" ON trainers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Trainers can update own profile" ON trainers;
CREATE POLICY "Trainers can update own profile" ON trainers
  FOR UPDATE USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. STUDENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  user_id uuid REFERENCES auth.users,
  full_name text NOT NULL,
  birth_date date,
  experience_level text,
  goals text[],
  injuries jsonb DEFAULT '[]'::jsonb,
  available_equipment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_students_modtime ON students;
CREATE TRIGGER update_students_modtime
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage their students" ON students;
CREATE POLICY "Trainers can manage their students" ON students
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can view own profile" ON students;
CREATE POLICY "Students can view own profile" ON students
  FOR SELECT USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. BODY METRICS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  measured_at timestamptz DEFAULT now(),
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can manage their students metrics" ON body_metrics;
CREATE POLICY "Trainers can manage their students metrics" ON body_metrics
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can view own metrics" ON body_metrics;
CREATE POLICY "Students can view own metrics" ON body_metrics
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can insert own metrics" ON body_metrics;
CREATE POLICY "Students can insert own metrics" ON body_metrics
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 4. ROUTINE TEMPLATES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  name text NOT NULL,
  goal text,
  weeks int DEFAULT 4,
  generated_by_ai boolean DEFAULT false,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_routine_templates_modtime ON routine_templates;
CREATE TRIGGER update_routine_templates_modtime
  BEFORE UPDATE ON routine_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage own templates" ON routine_templates;
CREATE POLICY "Trainers can manage own templates" ON routine_templates
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 5. STUDENT ROUTINES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  template_id uuid REFERENCES routine_templates(id) NOT NULL,
  starts_on date,
  ends_on date,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE student_routines ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_student_routines_modtime ON student_routines;
CREATE TRIGGER update_student_routines_modtime
  BEFORE UPDATE ON student_routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage student routines" ON student_routines;
CREATE POLICY "Trainers can manage student routines" ON student_routines
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can view own routines" ON student_routines;
CREATE POLICY "Students can view own routines" ON student_routines
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 6. ROUTINE SESSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_routine_id uuid REFERENCES student_routines(id) NOT NULL,
  scheduled_for date NOT NULL,
  status text DEFAULT 'pending',
  fatigue_level int,
  rpe_avg numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE routine_sessions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_routine_sessions_modtime ON routine_sessions;
CREATE TRIGGER update_routine_sessions_modtime
  BEFORE UPDATE ON routine_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can view and manage student sessions" ON routine_sessions;
CREATE POLICY "Trainers can view and manage student sessions" ON routine_sessions
  FOR ALL USING (
    student_routine_id IN (
      SELECT id FROM student_routines WHERE student_id IN (
        SELECT id FROM students WHERE trainer_id IN (
          SELECT id FROM trainers WHERE user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Students can manage own sessions" ON routine_sessions;
CREATE POLICY "Students can manage own sessions" ON routine_sessions
  FOR ALL USING (
    student_routine_id IN (
      SELECT id FROM student_routines WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 7. EXERCISE LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_session_id uuid REFERENCES routine_sessions(id) NOT NULL,
  exercise_name text NOT NULL,
  set_number int NOT NULL,
  reps int,
  weight_kg numeric,
  rpe int,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view and manage logs" ON exercise_logs;
CREATE POLICY "Trainers can view and manage logs" ON exercise_logs
  FOR ALL USING (
    routine_session_id IN (
      SELECT id FROM routine_sessions WHERE student_routine_id IN (
        SELECT id FROM student_routines WHERE student_id IN (
          SELECT id FROM students WHERE trainer_id IN (
            SELECT id FROM trainers WHERE user_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Students can manage own logs" ON exercise_logs;
CREATE POLICY "Students can manage own logs" ON exercise_logs
  FOR ALL USING (
    routine_session_id IN (
      SELECT id FROM routine_sessions WHERE student_routine_id IN (
        SELECT id FROM student_routines WHERE student_id IN (
          SELECT id FROM students WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 8. PERSONAL RECORDS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  exercise_name text NOT NULL,
  weight_kg numeric NOT NULL,
  reps int NOT NULL,
  achieved_on date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can manage student PRs" ON personal_records;
CREATE POLICY "Trainers can manage student PRs" ON personal_records
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can view own PRs" ON personal_records;
CREATE POLICY "Students can view own PRs" ON personal_records
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 9. PROGRESS PHOTOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  storage_path text NOT NULL,
  taken_on date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view and manage student photos" ON progress_photos;
CREATE POLICY "Trainers can view and manage student photos" ON progress_photos
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can manage own photos" ON progress_photos;
CREATE POLICY "Students can manage own photos" ON progress_photos
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 10. TRAINER AVAILABILITY (incluye gym_id)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  block_type text NOT NULL DEFAULT 'available',
  capacity int DEFAULT 1,
  session_duration_min int DEFAULT 60,
  gym_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trainer_availability ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_trainer_availability_modtime ON trainer_availability;
CREATE TRIGGER update_trainer_availability_modtime
  BEFORE UPDATE ON trainer_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage own availability" ON trainer_availability;
CREATE POLICY "Trainers can manage own availability" ON trainer_availability
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can view trainer availability" ON trainer_availability;
CREATE POLICY "Students can view trainer availability" ON trainer_availability
  FOR SELECT USING (
    trainer_id IN (SELECT trainer_id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 11. GYMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view gyms" ON gyms;
CREATE POLICY "Authenticated users can view gyms" ON gyms
  FOR SELECT USING (auth.role() = 'authenticated');

INSERT INTO gyms (name) VALUES
  ('Gilmar Gym'), ('Revo Sport'), ('Imperium Center'), ('Smart Fit'),
  ('Bodytech'), ('Millenium Gym'), ('Strong Gym'), ('Murdock Gym'), ('Otro')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 12. BOOKINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_availability_id uuid REFERENCES trainer_availability(id) NOT NULL,
  student_id uuid REFERENCES students(id) NOT NULL,
  status text DEFAULT 'reserved',
  reserved_at timestamptz DEFAULT now(),
  cancelled_at timestamptz,
  attended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (trainer_availability_id, student_id)
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_bookings_modtime ON bookings;
CREATE TRIGGER update_bookings_modtime
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage student bookings" ON bookings;
CREATE POLICY "Trainers can manage student bookings" ON bookings
  FOR ALL USING (
    trainer_availability_id IN (
      SELECT id FROM trainer_availability WHERE trainer_id IN (
        SELECT id FROM trainers WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Students can manage own bookings" ON bookings;
CREATE POLICY "Students can manage own bookings" ON bookings
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 13. BOOKING WAITLIST
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_availability_id uuid REFERENCES trainer_availability(id) NOT NULL,
  student_id uuid REFERENCES students(id) NOT NULL,
  joined_at timestamptz DEFAULT now(),
  notified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can manage waitlist" ON booking_waitlist;
CREATE POLICY "Trainers can manage waitlist" ON booking_waitlist
  FOR ALL USING (
    trainer_availability_id IN (
      SELECT id FROM trainer_availability WHERE trainer_id IN (
        SELECT id FROM trainers WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Students can manage own waitlist entries" ON booking_waitlist;
CREATE POLICY "Students can manage own waitlist entries" ON booking_waitlist
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 14. DAILY CHECKINS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  checkin_date date NOT NULL,
  sleep_hours numeric,
  hydration_liters numeric,
  energy_level int,
  fatigue_level int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view student checkins" ON daily_checkins;
CREATE POLICY "Trainers can view student checkins" ON daily_checkins
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can manage own checkins" ON daily_checkins;
CREATE POLICY "Students can manage own checkins" ON daily_checkins
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 15. MESSAGES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  student_id uuid REFERENCES students(id) NOT NULL,
  sender text NOT NULL,
  body text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view and send messages" ON messages;
CREATE POLICY "Trainers can view and send messages" ON messages
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can view and send messages" ON messages;
CREATE POLICY "Students can view and send messages" ON messages
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 16. SESSION PACKAGES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) NOT NULL,
  total_sessions int NOT NULL,
  used_sessions int DEFAULT 0,
  amount numeric NOT NULL,
  currency text DEFAULT 'PEN',
  purchased_on date NOT NULL,
  expires_on date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE session_packages ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_session_packages_modtime ON session_packages;
CREATE TRIGGER update_session_packages_modtime
  BEFORE UPDATE ON session_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage session packages" ON session_packages;
CREATE POLICY "Trainers can manage session packages" ON session_packages
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Students can view own session packages" ON session_packages;
CREATE POLICY "Students can view own session packages" ON session_packages
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 17. INVOICES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  student_id uuid REFERENCES students(id) NOT NULL,
  package_id uuid REFERENCES session_packages(id),
  doc_type text NOT NULL,
  sunat_series text,
  sunat_number text,
  sunat_status text DEFAULT 'pending',
  sunat_xml_url text,
  sunat_pdf_url text,
  amount numeric NOT NULL,
  issued_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_invoices_modtime ON invoices;
CREATE TRIGGER update_invoices_modtime
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can view and manage invoices" ON invoices;
CREATE POLICY "Trainers can view and manage invoices" ON invoices
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can view own invoices" ON invoices;
CREATE POLICY "Students can view own invoices" ON invoices
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 18. SUBSCRIPTION PAYMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  amount numeric NOT NULL,
  paid_on date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  invoice_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view own payments" ON subscription_payments;
CREATE POLICY "Trainers can view own payments" ON subscription_payments
  FOR SELECT USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 19. ACTIVITY LOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert activity log" ON activity_log;
CREATE POLICY "Authenticated users can insert activity log" ON activity_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 20. SUPPORT TICKETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'open',
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_support_tickets_modtime ON support_tickets;
CREATE TRIGGER update_support_tickets_modtime
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Trainers can manage own tickets" ON support_tickets;
CREATE POLICY "Trainers can manage own tickets" ON support_tickets
  FOR ALL USING (
    trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- ÍNDICES DE RENDIMIENTO
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_trainer ON students(trainer_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_availability_trainer_dates ON trainer_availability(trainer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_availability ON bookings(trainer_availability_id);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_student ON body_metrics(student_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_student ON exercise_logs(routine_session_id);
CREATE INDEX IF NOT EXISTS idx_messages_trainer ON messages(trainer_id, sent_at DESC);
