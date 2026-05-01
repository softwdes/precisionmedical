-- Gyms reference table
CREATE TABLE gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view gyms" ON gyms FOR SELECT USING (auth.role() = 'authenticated');

INSERT INTO gyms (name) VALUES
  ('Gilmar Gym'),
  ('Revo Sport'),
  ('Imperium Center'),
  ('Smart Fit'),
  ('Bodytech'),
  ('Millenium Gym'),
  ('Strong Gym'),
  ('Murdock Gym'),
  ('Otro');

-- Link each availability block to a gym (stored as text name for simplicity)
ALTER TABLE trainer_availability
  ADD COLUMN gym_id text;
