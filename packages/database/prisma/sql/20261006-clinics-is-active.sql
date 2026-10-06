-- Habilitar / deshabilitar clinicas (pedido de Erick 2026-10-06).
-- Idempotente. Todas las filas existentes quedan activas: no cambia nada hasta
-- que alguien deshabilite una desde Settings > Clinics.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;
