-- ============================================================
-- Audit Agent Tables — Precision Medical
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- Agent settings: toggles + config per agent
CREATE TABLE IF NOT EXISTS agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "agentName" TEXT NOT NULL,
  "modeSurveillance" BOOLEAN NOT NULL DEFAULT true,
  "modeSemiAutonomous" BOOLEAN NOT NULL DEFAULT false,
  "modeAutonomous" BOOLEAN NOT NULL DEFAULT false,
  "scanFrequency" TEXT NOT NULL DEFAULT '30min',
  "scheduledScanTime" TEXT NOT NULL DEFAULT '02:00',
  "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
  "surveillanceActiveSince" TIMESTAMPTZ,
  "monthlyBudget" DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  UNIQUE("agentName")
);

INSERT INTO agent_settings ("agentName", "modeSurveillance")
  VALUES ('audit_agent', true)
  ON CONFLICT ("agentName") DO NOTHING;

-- Audit runs: each execution of the audit scan
CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
  "triggeredByUser" UUID,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'running',
  "findingsCount" INTEGER NOT NULL DEFAULT 0,
  "criticalCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "infoCount" INTEGER NOT NULL DEFAULT 0
);

-- Audit findings: individual anomalies detected per run
CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "severity" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "suggestion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "resolvedAt" TIMESTAMPTZ,
  "resolvedBy" UUID,
  "actionTaken" TEXT,
  "runId" UUID REFERENCES audit_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings("status");
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings("severity");

-- Agent costs: monthly API cost per agent
CREATE TABLE IF NOT EXISTS agent_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "agentName" TEXT NOT NULL,
  "month" DATE NOT NULL,
  "totalCost" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "operationCount" INTEGER NOT NULL DEFAULT 0,
  "modelUsed" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  UNIQUE("agentName", "month")
);
