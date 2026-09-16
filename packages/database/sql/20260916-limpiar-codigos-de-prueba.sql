-- ============================================================
-- Sacar del selector de cobro los códigos que dejó una prueba automática
-- Erick, 2026-09-16. Correr en el editor SQL de Supabase.
-- ============================================================
--
-- Entre el 3 y el 12 de septiembre una batería de pruebas end-to-end creó 12
-- códigos de servicio en la base de PRODUCCIÓN. Ninguno se usó en una visita
-- real. Siete de ellos NO son internos, así que **aparecen en el selector de
-- cobro** mezclados con los códigos de verdad.
--
-- Uno es `99999`, que además ocupa el número que se quiso usar para el copago
-- de atención directa.
--
-- ── Se DESACTIVAN, no se borran ────────────────────────────────────────────
--
-- `isActive = false` los saca del selector (la ruta `billable-items` filtra por
-- `isActive: true`) y es reversible con un UPDATE. Un DELETE no lo es, y si
-- alguno tuviera un cargo colgando se llevaría el cargo puesto.
--
-- La condición `NOT EXISTS` es un seguro, no un adorno: si alguno de estos
-- códigos llegara a tener un cargo real, NO se toca y la verificación lo muestra
-- como `USADO`. Mejor que quede uno sucio a romper una factura.
--
-- El `deletedAt` NO se toca: quedan en la tabla, visibles para quien los busque,
-- pero fuera de la pantalla de cobro.

BEGIN;

UPDATE service_codes
   SET "isActive" = false,
       notes = COALESCE(notes || ' · ', '') || 'Desactivado 2026-09-16: creado por una prueba end-to-end, nunca usado en una visita real.'
 WHERE code IN (
         '99999', 'E2E001', 'E2E002', 'E2E01', 'E2E3-99203', 'E2E4-99215', 'E2E99',
         'PM-E2E001', 'PM-E2E01', 'PM-E2E5', 'PM-E2ECPT', 'PM-E2ELIEN'
       )
   AND "isActive" = true
   AND NOT EXISTS (
         SELECT 1 FROM visit_service_codes v WHERE v."cptCode" = service_codes.code
       );

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
--
-- `estado` tiene que decir APAGADO en los 12. Si alguno dice USADO, ese tenía un
-- cargo real y quedó encendido a propósito — avisá antes de forzarlo.

SELECT
  code,
  "shortDescription",
  CASE
    WHEN EXISTS (SELECT 1 FROM visit_service_codes v WHERE v."cptCode" = service_codes.code)
      THEN 'USADO — NO SE TOCO'
    WHEN "isActive" THEN 'SIGUE ENCENDIDO — REVISAR'
    ELSE 'APAGADO'
  END AS estado
FROM service_codes
WHERE code IN (
        '99999', 'E2E001', 'E2E002', 'E2E01', 'E2E3-99203', 'E2E4-99215', 'E2E99',
        'PM-E2E001', 'PM-E2E01', 'PM-E2E5', 'PM-E2ECPT', 'PM-E2ELIEN'
      )
ORDER BY code;

-- Cuántos códigos de prueba quedan visibles en el selector. Tiene que dar 0.
SELECT COUNT(*) AS codigos_de_prueba_aun_visibles
FROM service_codes
WHERE "deletedAt" IS NULL AND "isActive" = true AND "isInternalOnly" = false
  AND ("shortDescription" ILIKE 'E2E%' OR code ILIKE 'E2E%' OR code = '99999');
