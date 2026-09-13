-- ════════════════════════════════════════════════════════════════════════════
-- Arreglo · `plannedServiceCodes` tiene que ser un ARRAY vacío, no un objeto
--
-- El script 06 insertó las citas con `'{}'` literal, que en jsonb es un OBJETO
-- vacío, no una lista. El modelo dice `Json @default("[]")` y el front hace
-- `d.plannedServiceCodes ?? []` y después `.map(...)`: con `{}` el `??` no
-- salta —porque no es null— y el `.map` revienta. O sea, el tab de Servicios de
-- esas citas se rompía al abrirlo.
--
-- Toca SOLO las que quedaron en `{}`; las que ya tienen su lista de servicios no
-- se tocan.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/02-fix-planned-service-codes.sql
-- ════════════════════════════════════════════════════════════════════════════

UPDATE appointments
   SET "plannedServiceCodes" = '[]'::jsonb
 WHERE "plannedServiceCodes" = '{}'::jsonb;

-- Verificación: las dos consultas tienen que dar 0.
-- SELECT COUNT(*) FROM appointments WHERE "plannedServiceCodes" = '{}'::jsonb;
-- SELECT COUNT(*) FROM appointments WHERE jsonb_typeof("plannedServiceCodes") <> 'array';
