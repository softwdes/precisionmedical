-- Add contact fields to gyms
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS email text;

-- Add comentario to goals, make value optional (system works by id going forward)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS comentario text;
ALTER TABLE goals ALTER COLUMN value DROP NOT NULL;
