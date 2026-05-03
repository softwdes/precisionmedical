CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  consultas integer NOT NULL DEFAULT 0,
  UNIQUE(trainer_id, fecha)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select" ON ai_usage
  FOR SELECT USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "ai_usage_insert" ON ai_usage
  FOR INSERT WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));

CREATE POLICY "ai_usage_update" ON ai_usage
  FOR UPDATE USING (trainer_id IN (SELECT id FROM trainers WHERE user_id = auth.uid()));
