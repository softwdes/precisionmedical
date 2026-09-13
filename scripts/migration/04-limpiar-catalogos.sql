-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza de catálogos · especialidades y servicios
--
-- ⚠️ NADA SE BORRA: todo se DESACTIVA (`isActive = false`). Un catálogo es
-- historia además de menú — si un caso viejo apunta a una especialidad, el
-- nombre tiene que seguir existiendo para poder mostrarlo. Desactivar lo saca
-- del selector y lo deja en la base.
--
-- ── Especialidades ──────────────────────────────────────────────────────────
-- El v2 tiene 10 y cuatro son de prueba ("Prueba", "Prueba1", "Prueba test",
-- "Urgency prueba"). Las REALES son seis. En v3 hay 93, con perlas como
-- `lksjfoisadufodsaiufsf89sa7f89sa6f87sad6f87sda`, que salieron de las pruebas
-- del equipo. Y solo 2 casos tienen especialidad asignada, así que apagar el
-- resto no deja nada colgado.
--
-- ── Servicios ───────────────────────────────────────────────────────────────
-- El catálogo del v2 tiene 329 y **solo 80 se usaron alguna vez** en 8.001
-- líneas de servicio. Se apagan los que nunca se usaron Y no están entre los
-- CPT del seed de v3 — un código que la clínica todavía no facturó pero que es
-- válido (99215, por ejemplo) tiene que seguir disponible.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/04-limpiar-catalogos.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Especialidades: quedan las seis reales ──────────────────────────────
UPDATE specialty_catalog
   SET "isActive" = false
 WHERE "isActive" = true
   AND name NOT IN ('Family Practice', 'Urgent Care', 'Membership',
                    'Auto Accidents', 'Pain Management', 'Surgery')
   -- Salvo que algún caso la esté usando: esa se queda viva aunque no esté en
   -- la lista, para no romper la pantalla del caso.
   AND id NOT IN (SELECT "specialtyId" FROM cases WHERE "specialtyId" IS NOT NULL);

-- ─── 2. Servicios que nunca se usaron ───────────────────────────────────────
-- "Usado" = aparece en la lista de servicios de alguna cita, en una nota, o en
-- los favoritos de alguien. Lo que no aparece en ninguna de las tres y no es un
-- CPT de 5 dígitos del catálogo oficial, se apaga.
UPDATE service_codes s
   SET "isActive" = false
 WHERE s."isActive" = true
   AND s.code !~ '^[0-9]{5}$'                      -- los CPT reales se quedan
   AND NOT EXISTS (SELECT 1 FROM visit_service_codes v WHERE v."serviceCodeId" = s.id)
   AND NOT EXISTS (SELECT 1 FROM user_service_favorites f WHERE f."serviceCodeId" = s.id)
   AND NOT EXISTS (
     SELECT 1 FROM appointments a
      WHERE a."plannedServiceCodes" @> jsonb_build_array(jsonb_build_object('code', s.code))
   );

COMMIT;

-- Verificación:
-- SELECT COUNT(*) FILTER (WHERE "isActive") AS activas, COUNT(*) AS total FROM specialty_catalog;
-- SELECT COUNT(*) FILTER (WHERE "isActive") AS activos, COUNT(*) AS total FROM service_codes;
