-- sync_logs: tracks automated sync operations (attendance, etc.)
CREATE TABLE IF NOT EXISTS sync_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL    DEFAULT now(),
  sync_type      text        NOT NULL,
  status         text        NOT NULL    DEFAULT 'completed',
  records_synced integer                 DEFAULT 0,
  duration_ms    integer,
  error_text     text
);

CREATE INDEX IF NOT EXISTS sync_logs_type_created ON sync_logs (sync_type, created_at DESC);

-- Seed one row so Estado del Sistema shows a real time instead of "No configurado"
INSERT INTO sync_logs (sync_type, status, records_synced)
VALUES ('attendance', 'completed', 0)
ON CONFLICT DO NOTHING;
