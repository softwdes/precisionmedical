-- ============================================================
-- Audit Agent Tables — Precision Medical
-- Run once in the Supabase SQL Editor (snake_case schema)
-- ============================================================

-- Agent settings: toggles + config per agent
CREATE TABLE IF NOT EXISTS agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name TEXT NOT NULL UNIQUE,
  mode_surveillance BOOLEAN NOT NULL DEFAULT true,
  mode_semi_autonomous BOOLEAN NOT NULL DEFAULT false,
  mode_autonomous BOOLEAN NOT NULL DEFAULT false,
  scan_frequency TEXT NOT NULL DEFAULT '30min',
  scheduled_scan_time TEXT NOT NULL DEFAULT '02:00',
  notify_email BOOLEAN NOT NULL DEFAULT true,
  surveillance_active_since TIMESTAMPTZ,
  monthly_budget DECIMAL(10,2) NOT NULL DEFAULT 50.00
);

INSERT INTO agent_settings (agent_name, mode_surveillance)
  VALUES ('audit_agent', true)
  ON CONFLICT (agent_name) DO NOTHING;

-- Audit runs: each execution of the audit scan
CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  triggered_by_user UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  findings_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0
);

-- Audit findings: individual anomalies detected per run
CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT NOT NULL,
  suggestion TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  action_taken TEXT,
  run_id UUID REFERENCES audit_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings(status);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);

-- Agent costs: monthly API cost per agent
CREATE TABLE IF NOT EXISTS agent_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name TEXT NOT NULL,
  month DATE NOT NULL,
  total_cost DECIMAL(10,4) NOT NULL DEFAULT 0,
  operation_count INTEGER NOT NULL DEFAULT 0,
  model_used TEXT NOT NULL DEFAULT 'poolside/laguna-m.1:free',
  UNIQUE(agent_name, month)
);
