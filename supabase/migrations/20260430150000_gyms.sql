-- Gyms reference table
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
  ('Gilmar Gym'),
  ('Revo Sport'),
  ('Imperium Center'),
  ('Smart Fit'),
  ('Bodytech'),
  ('Millenium Gym'),
  ('Strong Gym'),
  ('Murdock Gym'),
  ('Otro')
ON CONFLICT (name) DO NOTHING;

-- Link each availability block to a gym (stored as text name for simplicity)
ALTER TABLE trainer_availability
  ADD COLUMN IF NOT EXISTS gym_id text;
