-- ============================================================
-- Freelancers Module — Run in Supabase SQL Editor
-- ============================================================

-- 1. FREELANCERS
CREATE TABLE IF NOT EXISTS freelancers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT         NOT NULL,
  email         TEXT,
  phone         TEXT,
  pais          TEXT         NOT NULL,
  modalidad     TEXT         NOT NULL CHECK (modalidad IN ('POR_HORA', 'POR_SERVICIO')),
  "tarifaBase"  DECIMAL(10,2),
  moneda        TEXT         NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','BOB','PEN')),
  status        TEXT         NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  notas         TEXT,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);

-- 2. FREELANCER PAYMENTS
CREATE TABLE IF NOT EXISTS freelancer_payments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "freelancerId"  UUID         NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  descripcion     TEXT         NOT NULL,
  modalidad       TEXT         NOT NULL CHECK (modalidad IN ('POR_HORA', 'POR_SERVICIO')),
  horas           DECIMAL(8,2),
  "tarifaHora"    DECIMAL(10,2),
  monto           DECIMAL(12,2) NOT NULL,
  moneda          TEXT         NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','BOB','PEN')),
  "fechaServicio" DATE         NOT NULL,
  "fechaPago"     DATE         NOT NULL,
  notas           TEXT,
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_freelancers_status        ON freelancers(status);
CREATE INDEX IF NOT EXISTS idx_freelancers_modalidad     ON freelancers(modalidad);
CREATE INDEX IF NOT EXISTS idx_freelancers_deleted_at    ON freelancers("deletedAt");
CREATE INDEX IF NOT EXISTS idx_fp_freelancer_id         ON freelancer_payments("freelancerId");
CREATE INDEX IF NOT EXISTS idx_fp_fecha_pago            ON freelancer_payments("fechaPago");

-- 4. RLS (disable for admin client — supabaseAdmin bypasses RLS)
ALTER TABLE freelancers         DISABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_payments DISABLE ROW LEVEL SECURITY;
