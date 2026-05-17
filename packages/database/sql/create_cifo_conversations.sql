CREATE TABLE IF NOT EXISTS cifo_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  language text DEFAULT 'es',
  tokens_used integer DEFAULT 0,
  model_used text DEFAULT 'meta-llama/llama-3.1-8b-instruct:free',
  response_time_ms integer
);

CREATE INDEX IF NOT EXISTS idx_cifo_conversations_session  ON cifo_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_cifo_conversations_user     ON cifo_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_cifo_conversations_created  ON cifo_conversations(created_at DESC);
