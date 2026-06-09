-- ============================================================
-- Migration: Add LienMaster v2 app permissions to roles_config
-- Date: 2026-06-08
--
-- Agrega tres nuevos campos al JSON de permissions en roles_config:
--   lm_back_office  → Billing / Back-Office (Brunella)
--   lm_clinical     → Clinical app (doctores, MAs)
--   lm_attorney     → Attorney portal
--
-- Niveles: "write" | "read" | "none"
-- ============================================================

-- 1. Inicializar todos los roles con "none" (base segura)
UPDATE roles_config
SET permissions = permissions
  || '{"lm_back_office": "none", "lm_clinical": "none", "lm_attorney": "none"}'::jsonb;

-- 2. SUPER_ADMIN → acceso total a todo
UPDATE roles_config
SET permissions = permissions
  || '{"lm_back_office": "write", "lm_clinical": "write", "lm_attorney": "write"}'::jsonb
WHERE role = 'super_admin';

-- 3. ADMIN → back-office write, clinical read (supervisión), attorney read
UPDATE roles_config
SET permissions = permissions
  || '{"lm_back_office": "write", "lm_clinical": "read", "lm_attorney": "read"}'::jsonb
WHERE role = 'admin';

-- 4. CONTADOR (Brunella) → solo back-office
UPDATE roles_config
SET permissions = permissions
  || '{"lm_back_office": "write"}'::jsonb
WHERE role = 'contador';

-- 5. EMPLOYEE (MA, recepción, enfermería) → clinical write
UPDATE roles_config
SET permissions = permissions
  || '{"lm_clinical": "write"}'::jsonb
WHERE role = 'employee';

-- 6. PROVIDER (doctores) → clinical write
UPDATE roles_config
SET permissions = permissions
  || '{"lm_clinical": "write"}'::jsonb
WHERE role = 'provider';

-- 7. LAWYER → attorney write
UPDATE roles_config
SET permissions = permissions
  || '{"lm_attorney": "write"}'::jsonb
WHERE role = 'lawyer';

-- AUDITOR_AI queda en "none" para las 3 apps (solo lee lm_admin)
