-- ==============================================================================
-- INITIAL SCHEMA: Precision Trainer
-- Includes tables, RLS policies, and triggers for updated_at
-- ==============================================================================

-- 1. Helper Function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================================================
-- TENANTS (Trainers)
-- ==============================================================================
CREATE TABLE trainers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  business_name text not null,
  slug text unique not null,
  logo_url text,
  brand_color text,
  bio text,
  specialties text[],
  certifications jsonb default '[]'::jsonb,
  subscription_status text default 'trialing',
  subscription_started_at timestamptz default now(),
  subscription_expires_at timestamptz,
  enabled_modules jsonb default '{"biometric": false, "advanced_reports": false, "whatsapp": false, "ai_quota": 50}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_trainers_modtime BEFORE UPDATE ON trainers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Policies for trainers
-- Trainer can read/update their own profile
CREATE POLICY "Trainers can view own profile" ON trainers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Trainers can update own profile" ON trainers FOR UPDATE USING (auth.uid() = user_id);

-- ==============================================================================
-- STUDENTS (Alumnos)
-- ==============================================================================
CREATE TABLE students (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  user_id uuid references auth.users,
  full_name text not null,
  birth_date date,
  experience_level text, -- beginner | intermediate | advanced
  goals text[],          -- hypertrophy | strength | fat_loss | endurance
  injuries jsonb default '[]'::jsonb,
  available_equipment text, -- full_gym | home_basic | bodyweight
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  archived_at timestamptz
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_students_modtime BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Policies for students
-- Trainer can do all for their own students. Student can view their own profile.
CREATE POLICY "Trainers can manage their students" ON students FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);
CREATE POLICY "Students can view own profile" ON students FOR SELECT USING (auth.uid() = user_id);

-- ==============================================================================
-- BODY METRICS (Métricas biométricas)
-- ==============================================================================
CREATE TABLE body_metrics (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  measured_at timestamptz default now(),
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  notes text,
  created_at timestamptz default now()
);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers can manage their students metrics" ON body_metrics FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can view own metrics" ON body_metrics FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);
CREATE POLICY "Students can insert own metrics" ON body_metrics FOR INSERT WITH CHECK (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- ROUTINE TEMPLATES
-- ==============================================================================
CREATE TABLE routine_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  name text not null,
  goal text,
  weeks int default 4,
  generated_by_ai boolean default false,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_routine_templates_modtime BEFORE UPDATE ON routine_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage own templates" ON routine_templates FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);

-- ==============================================================================
-- STUDENT ROUTINES
-- ==============================================================================
CREATE TABLE student_routines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  template_id uuid references routine_templates(id) not null,
  starts_on date,
  ends_on date,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE student_routines ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_student_routines_modtime BEFORE UPDATE ON student_routines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage student routines" ON student_routines FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can view own routines" ON student_routines FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- ROUTINE SESSIONS
-- ==============================================================================
CREATE TABLE routine_sessions (
  id uuid primary key default gen_random_uuid(),
  student_routine_id uuid references student_routines(id) not null,
  scheduled_for date not null,
  status text default 'pending', -- pending | completed | skipped
  fatigue_level int,             -- 1-10
  rpe_avg numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE routine_sessions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_routine_sessions_modtime BEFORE UPDATE ON routine_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can view and manage student sessions" ON routine_sessions FOR ALL USING (
  student_routine_id IN (SELECT id FROM student_routines WHERE student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())))
);
CREATE POLICY "Students can manage own sessions" ON routine_sessions FOR ALL USING (
  student_routine_id IN (SELECT id FROM student_routines WHERE student_id IN (SELECT id FROM students WHERE user_id = auth.uid()))
);

-- ==============================================================================
-- EXERCISE LOGS
-- ==============================================================================
CREATE TABLE exercise_logs (
  id uuid primary key default gen_random_uuid(),
  routine_session_id uuid references routine_sessions(id) not null,
  exercise_name text not null,
  set_number int not null,
  reps int,
  weight_kg numeric,
  rpe int,
  completed_at timestamptz default now(),
  created_at timestamptz default now()
);

ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view and manage logs" ON exercise_logs FOR ALL USING (
  routine_session_id IN (SELECT id FROM routine_sessions WHERE student_routine_id IN (SELECT id FROM student_routines WHERE student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))))
);
CREATE POLICY "Students can manage own logs" ON exercise_logs FOR ALL USING (
  routine_session_id IN (SELECT id FROM routine_sessions WHERE student_routine_id IN (SELECT id FROM student_routines WHERE student_id IN (SELECT id FROM students WHERE user_id = auth.uid())))
);

-- ==============================================================================
-- PERSONAL RECORDS
-- ==============================================================================
CREATE TABLE personal_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  exercise_name text not null,
  weight_kg numeric not null,
  reps int not null,
  achieved_on date not null,
  created_at timestamptz default now()
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can manage student PRs" ON personal_records FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can view own PRs" ON personal_records FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- PROGRESS PHOTOS
-- ==============================================================================
CREATE TABLE progress_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  storage_path text not null,
  taken_on date not null,
  notes text,
  created_at timestamptz default now()
);

ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view and manage student photos" ON progress_photos FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can manage own photos" ON progress_photos FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- TRAINER AVAILABILITY
-- ==============================================================================
CREATE TABLE trainer_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type text not null default 'available', -- available | personal | meal | break
  capacity int default 1,
  session_duration_min int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE trainer_availability ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_trainer_availability_modtime BEFORE UPDATE ON trainer_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage own availability" ON trainer_availability FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);
CREATE POLICY "Students can view trainer availability" ON trainer_availability FOR SELECT USING (
  trainer_id IN (SELECT trainer_id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- BOOKINGS
-- ==============================================================================
CREATE TABLE bookings (
  id uuid primary key default gen_random_uuid(),
  trainer_availability_id uuid references trainer_availability(id) not null,
  student_id uuid references students(id) not null,
  status text default 'reserved', -- reserved | confirmed | cancelled | no_show | attended
  reserved_at timestamptz default now(),
  cancelled_at timestamptz,
  attended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (trainer_availability_id, student_id)
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_bookings_modtime BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage student bookings" ON bookings FOR ALL USING (
  trainer_availability_id IN (SELECT id FROM trainer_availability WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can manage own bookings" ON bookings FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- BOOKING WAITLIST
-- ==============================================================================
CREATE TABLE booking_waitlist (
  id uuid primary key default gen_random_uuid(),
  trainer_availability_id uuid references trainer_availability(id) not null,
  student_id uuid references students(id) not null,
  joined_at timestamptz default now(),
  notified boolean default false,
  created_at timestamptz default now()
);

ALTER TABLE booking_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can manage waitlist" ON booking_waitlist FOR ALL USING (
  trainer_availability_id IN (SELECT id FROM trainer_availability WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can manage own waitlist entries" ON booking_waitlist FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- DAILY CHECKINS
-- ==============================================================================
CREATE TABLE daily_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  checkin_date date not null,
  sleep_hours numeric,
  hydration_liters numeric,
  energy_level int,  -- 1-10
  fatigue_level int, -- 1-10
  created_at timestamptz default now()
);

ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view student checkins" ON daily_checkins FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can manage own checkins" ON daily_checkins FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- MESSAGES
-- ==============================================================================
CREATE TABLE messages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  student_id uuid references students(id) not null,
  sender text not null, -- trainer | student
  body text not null,
  attachments jsonb default '[]'::jsonb,
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view and send messages" ON messages FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);
CREATE POLICY "Students can view and send messages" ON messages FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- SESSION PACKAGES
-- ==============================================================================
CREATE TABLE session_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  total_sessions int not null,
  used_sessions int default 0,
  amount numeric not null,
  currency text default 'PEN',
  purchased_on date not null,
  expires_on date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE session_packages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_session_packages_modtime BEFORE UPDATE ON session_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage session packages" ON session_packages FOR ALL USING (
  student_id IN (SELECT id FROM students WHERE trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()))
);
CREATE POLICY "Students can view own session packages" ON session_packages FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- INVOICES (Facturas/Boletas Electrónicas)
-- ==============================================================================
CREATE TABLE invoices (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  student_id uuid references students(id) not null,
  package_id uuid references session_packages(id),
  doc_type text not null, -- boleta | factura
  sunat_series text,
  sunat_number text,
  sunat_status text default 'pending', -- pending | accepted | rejected
  sunat_xml_url text,
  sunat_pdf_url text,
  amount numeric not null,
  issued_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_invoices_modtime BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can view and manage invoices" ON invoices FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);
CREATE POLICY "Students can view own invoices" ON invoices FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
);

-- ==============================================================================
-- SUBSCRIPTION PAYMENTS (Master Panel)
-- ==============================================================================
CREATE TABLE subscription_payments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  amount numeric not null,
  paid_on date not null,
  period_start date not null,
  period_end date not null,
  invoice_url text,
  created_at timestamptz default now()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view own payments" ON subscription_payments FOR SELECT USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);

-- ==============================================================================
-- ACTIVITY LOG
-- ==============================================================================
CREATE TABLE activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text, -- master | trainer | student
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Insert only for authenticated users. Read only for master (handled via edge functions/service role usually, or specific master policy)
CREATE POLICY "Authenticated users can insert activity log" ON activity_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ==============================================================================
-- SUPPORT TICKETS
-- ==============================================================================
CREATE TABLE support_tickets (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references trainers(id) not null,
  subject text not null,
  body text not null,
  status text default 'open', -- open | in_progress | closed
  priority text default 'normal',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_support_tickets_modtime BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Trainers can manage own tickets" ON support_tickets FOR ALL USING (
  trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid())
);
