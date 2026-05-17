-- ============================================================
-- Precision Medical · Audit Agent Tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. agent_settings
-- One row per agent, identified by agent_name
CREATE TABLE IF NOT EXISTS agent_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  agent_name               text NOT NULL,
  mode_surveillance        boolean NOT NULL DEFAULT true,
  mode_semi_autonomous     boolean NOT NULL DEFAULT false,
  mode_autonomous          boolean NOT NULL DEFAULT false,
  scan_frequency           text NOT NULL DEFAULT '30min'
                             CHECK (scan_frequency IN ('15min', '30min', '1h', 'nightly')),
  scheduled_scan_time      text NOT NULL DEFAULT '02:00',
  notify_email             boolean NOT NULL DEFAULT true,
  surveillance_active_since timestamptz,
  monthly_budget           numeric(10, 2) NOT NULL DEFAULT 50,

  CONSTRAINT agent_settings_agent_name_key UNIQUE (agent_name)
);

-- Seed the audit_agent row so the UI shows defaults immediately
INSERT INTO agent_settings (agent_name)
VALUES ('audit_agent')
ON CONFLICT (agent_name) DO NOTHING;

-- ============================================================

-- 2. audit_runs
-- One row per scan execution (manual or cron)
CREATE TABLE IF NOT EXISTS audit_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  triggered_by      text NOT NULL CHECK (triggered_by IN ('manual', 'cron')),
  triggered_by_user uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  started_at        timestamptz NOT NULL,
  completed_at      timestamptz,
  status            text NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'failed')),
  findings_count    integer NOT NULL DEFAULT 0,
  critical_count    integer NOT NULL DEFAULT 0,
  warning_count     integer NOT NULL DEFAULT 0,
  info_count        integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS audit_runs_status_idx      ON audit_runs (status);
CREATE INDEX IF NOT EXISTS audit_runs_created_at_idx  ON audit_runs (created_at DESC);

-- ============================================================

-- 3. audit_findings
-- Individual findings linked to an audit run
CREATE TABLE IF NOT EXISTS audit_findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  run_id       uuid REFERENCES audit_runs (id) ON DELETE SET NULL,
  severity     text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  module       text NOT NULL,
  description  text NOT NULL,
  suggestion   text,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'resolved', 'ignored')),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action_taken text
);

CREATE INDEX IF NOT EXISTS audit_findings_status_idx    ON audit_findings (status);
CREATE INDEX IF NOT EXISTS audit_findings_severity_idx  ON audit_findings (severity);
CREATE INDEX IF NOT EXISTS audit_findings_run_id_idx    ON audit_findings (run_id);
CREATE INDEX IF NOT EXISTS audit_findings_created_idx   ON audit_findings (created_at DESC);

-- ============================================================

-- 4. agent_costs
-- Monthly cost / operation tracking per agent (cifo + audit_agent)
CREATE TABLE IF NOT EXISTS agent_costs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  agent_name       text NOT NULL,
  month            date NOT NULL,
  total_cost       numeric(10, 6) NOT NULL DEFAULT 0,
  operation_count  integer NOT NULL DEFAULT 0,
  model_used       text NOT NULL DEFAULT 'poolside/laguna-m.1:free',

  CONSTRAINT agent_costs_agent_month_key UNIQUE (agent_name, month)
);

CREATE INDEX IF NOT EXISTS agent_costs_agent_month_idx ON agent_costs (agent_name, month DESC);

-- ============================================================
-- RLS: disable for service-role-only tables (admin client bypasses RLS)
ALTER TABLE agent_settings  DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_runs      DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings  DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_costs     DISABLE ROW LEVEL SECURITY;
