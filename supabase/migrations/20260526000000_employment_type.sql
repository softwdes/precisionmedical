-- Add employment_type to employees for FLSA overtime classification
-- Non-exempt (hourly): overtime > 40h/week = 1.5x
-- Exempt (salaried): no overtime, fixed salary
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_type text
  DEFAULT 'non_exempt'
  CHECK (employment_type IN ('exempt', 'non_exempt'));
