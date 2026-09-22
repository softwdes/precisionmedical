-- ============================================================================
-- MEDICIÓN · Los casos MVA que nacieron del tipo PRESELECCIONADO.
--
-- SOLO LEE. Pegalo en el editor SQL. No hay un script que escriba: la
-- conclusión fue que **no hay nada que limpiar**, y abajo está por qué.
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- El alta rápida y el wizard abrían con MVA ya marcado (`useState('MVA')`), y
-- una respuesta que viene contestada nadie la corrige. Medido el 22-sep-2026:
--
--     MVA en total ............ 1.112
--     sin fecha de accidente
--     Y sin bufete ............   594   ← sospechosos de estar mal tipados
--       · de esos, con citas ..   567
--       · de esos, vacíos .....    27
--
-- ── Por qué NO se limpió nada ───────────────────────────────────────────────
--
-- 1. Los 567 CON CITAS no se tocan (decisión de Erick, 22-sep). Son pacientes
--    que se atendieron bajo ese caso; cambiarle el tipo cambia la tarifa (MVA
--    vs GM) y el flujo de lien. Además "sin fecha ni bufete" es una SOSPECHA,
--    no una prueba: un MVA real de alguien sin abogado cae en el mismo filtro.
--
-- 2. Los 27 VACÍOS resultaron NO ser del bug. Se midió campo por campo:
--
--       con_consentimientos .. 26      con_lien .............. 8
--       con_seguro_auto ......  1      con_token ............. 0
--       con_documentos .......  0      con_intake ............ 0
--       con_facturacion ......  0      con_llamadas/mensajes . 0
--
--    `case_consents` no lo escribe NINGUNA línea de v3 —se buscó en todo el
--    repo y hay cero escritores—; las filas vienen de la migración del v2, y
--    el propio modelo habla de "blob legacy (v2) migrado". O sea que 26 de 27
--    son casos MIGRADOS, no casos que nacieron del MVA preseleccionado. Y 8
--    tienen FIRMA DE LIEN, que es un documento legal firmado: eso no es un
--    caso vacío por ninguna definición.
--
--    El único que pasaba un filtro estricto era MVA-2 / P-2, creado el
--    2025-08-05 — el segundo registro que existe en el sistema. También
--    migración.
--
-- 3. Lo que sí se hizo fue cortar la fuente: el tipo dejó de venir contestado,
--    y el alta rápida ganó una tercera opción que NO crea caso ("todavía no,
--    se define al agendar"). Los que aparezcan mal tipados de acá en más se
--    corrigen de a uno con el doble clic en la columna TYPE de Seguimiento,
--    que renombra el código (MVA-3408 → GM-3408) y re-tipa las citas.
--
-- Este archivo queda para que el próximo que se haga la pregunta no tenga que
-- volver a medirlo.
-- ============================================================================

-- ── 1. El corte general ────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE "caseType" = 'MVA')     AS mva_total,
  COUNT(*) FILTER (WHERE "caseType" = 'GENERAL') AS gm_total,
  COUNT(*) FILTER (WHERE "caseType" = 'MVA'
                     AND "accidentDate" IS NULL
                     AND "lawFirmId"    IS NULL) AS mva_sospechosos
FROM cases
WHERE "deletedAt" IS NULL;

-- ── 2. De los sospechosos, qué tienen colgando ─────────────────────────────
-- Es la consulta que desarmó la hipótesis: `con_consentimientos` y `con_lien`
-- son los que prueban que vienen del v2 y que no están vacíos.
SELECT
  COUNT(*) AS vacios_por_citas_y_notas,
  COUNT(*) FILTER (WHERE c."portalToken" IS NOT NULL)                                         AS con_token,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM case_consents        x WHERE x."caseId"=c.id)) AS con_consentimientos,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM case_tracking_notes  x WHERE x."caseId"=c.id)) AS con_notas_tracking,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM patient_documents    x WHERE x."caseId"=c.id)) AS con_documentos,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM intake_submissions   x WHERE x."caseId"=c.id)) AS con_intake,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lien_signatures      x WHERE x."caseId"=c.id)) AS con_lien,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM case_auto_insurances x WHERE x."caseId"=c.id)) AS con_seguro_auto,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM appointment_billing  x WHERE x."caseId"=c.id)) AS con_facturacion,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM call_logs            x WHERE x."caseId"=c.id)) AS con_llamadas,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM message_logs         x WHERE x."caseId"=c.id)) AS con_mensajes,
  MIN(c."createdAt")::date AS mas_viejo,
  MAX(c."createdAt")::date AS mas_nuevo
FROM cases c
WHERE c."deletedAt" IS NULL AND c."caseType" = 'MVA'
  AND c."accidentDate" IS NULL AND c."lawFirmId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM appointments x WHERE x."caseId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM case_notes   x WHERE x."caseId"=c.id);
