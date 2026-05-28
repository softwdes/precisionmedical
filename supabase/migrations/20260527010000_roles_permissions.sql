-- ─── Roles & Permissions System ──────────────────────────────────────────────
-- 1. Add CONTADOR to role enum (safe additive; no-op if already present or text col)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    EXECUTE 'ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS ''CONTADOR''';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- column is text type, accepts any value
END $$;

-- 2. Create roles_config table (permissions per role stored as JSONB)
CREATE TABLE IF NOT EXISTS roles_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL UNIQUE,
  label       text NOT NULL,
  color       text NOT NULL,
  icon        text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system   boolean DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 3. Insert default role configurations
-- role key uses lowercase (internal app values)
INSERT INTO roles_config (role, label, color, icon, description, is_system, permissions)
VALUES

('super_admin', 'Super Admin', '#6366F1', 'ti-crown',
 'Acceso total al sistema.',
 true,
 '{
   "lm_admin": {
     "dashboard": "write",
     "usuarios": "write",
     "empleados": "write",
     "finanzas": "write",
     "metricas": "write",
     "agentes_ia": "write",
     "configuracion": "write"
   },
   "pm_timeclock": true
 }'::jsonb),

('admin', 'Admin', '#06B6D4', 'ti-shield-check',
 'Gestión operativa sin acceso a usuarios ni configuración.',
 false,
 '{
   "lm_admin": {
     "dashboard": "read",
     "usuarios": "none",
     "empleados": "write",
     "finanzas": "read",
     "metricas": "write",
     "agentes_ia": "cifo_only",
     "configuracion": "none"
   },
   "pm_timeclock": true
 }'::jsonb),

('contador', 'Contador', '#F59E0B', 'ti-calculator',
 'Solo acceso a Asistencia y Reporte de Horas.',
 false,
 '{
   "lm_admin": {
     "dashboard": "none",
     "usuarios": "none",
     "empleados": "payroll_only",
     "finanzas": "none",
     "metricas": "none",
     "agentes_ia": "none",
     "configuracion": "none"
   },
   "pm_timeclock": false
 }'::jsonb),

('employee', 'Empleado', '#10B981', 'ti-user',
 'Acceso exclusivo a PM Time Clock.',
 false,
 '{
   "lm_admin": {
     "dashboard": "none",
     "usuarios": "none",
     "empleados": "none",
     "finanzas": "none",
     "metricas": "none",
     "agentes_ia": "none",
     "configuracion": "none"
   },
   "pm_timeclock": true
 }'::jsonb),

('lawyer', 'Abogado', '#F59E0B', 'ti-gavel',
 'Métricas de sus casos.',
 false,
 '{
   "lm_admin": {
     "dashboard": "none",
     "usuarios": "none",
     "empleados": "none",
     "finanzas": "none",
     "metricas": "own_cases",
     "agentes_ia": "none",
     "configuracion": "none"
   },
   "pm_timeclock": false
 }'::jsonb),

('provider', 'Proveedor', '#8B5CF6', 'ti-truck-delivery',
 'Métricas de sus propios datos.',
 false,
 '{
   "lm_admin": {
     "dashboard": "none",
     "usuarios": "none",
     "empleados": "none",
     "finanzas": "none",
     "metricas": "own_data",
     "agentes_ia": "none",
     "configuracion": "none"
   },
   "pm_timeclock": false
 }'::jsonb),

('ia_auditor', 'IA Auditor', '#F43F5E', 'ti-robot',
 'Agentes IA y Finanzas (solo lectura).',
 true,
 '{
   "lm_admin": {
     "dashboard": "none",
     "usuarios": "none",
     "empleados": "none",
     "finanzas": "read",
     "metricas": "none",
     "agentes_ia": "write",
     "configuracion": "none"
   },
   "pm_timeclock": false
 }'::jsonb)

ON CONFLICT (role) DO NOTHING;

-- 4. Helper function: auto-update updated_at on roles_config
CREATE OR REPLACE FUNCTION roles_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS roles_config_updated_at ON roles_config;
CREATE TRIGGER roles_config_updated_at
  BEFORE UPDATE ON roles_config
  FOR EACH ROW EXECUTE FUNCTION roles_config_updated_at();
