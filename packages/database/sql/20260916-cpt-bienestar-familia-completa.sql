-- ============================================================
-- Completar la familia de exámenes de bienestar (99381-99397)
-- Erick, 2026-09-16. Correr en el editor SQL de Supabase.
-- ============================================================
--
-- Continúa `20260916-cpt-descripciones-wellness.sql`, que ya arregló 99384,
-- 99385, 99386, 99387, 99396 y 99397 con los textos que dictó Erick. Faltaban
-- los otros 8 de la misma familia: seis mostraban SU PROPIO NÚMERO como
-- descripción, y dos tenían texto que no describe nada.
--
--   99381  decía "Need comments"  ← alguien escribió una NOTA en el campo
--   99395  decía "Physical Exam Established Patient"  ← sin tramo de edad
--   99382 99383 99391 99392 99393 99394  decían su propio número
--
-- ── De dónde salen los tramos de edad (esto NO es una adivinanza) ───────────
--
-- Las dos series van en paralelo y los textos que dictó Erick las anclan en los
-- dos extremos. Alineadas, la correspondencia es exacta:
--
--     nuevo   establecido   tramo
--     99381      99391      menor de 1 año
--     99382      99392      1-4
--     99383      99393      5-11
--     99384  ←   99394      12-17     (99384 dictado por Erick)
--     99385  ←   99395      18-39     (99385 dictado; 99395 ya decía "Established Patient")
--     99386  ←   99396  ←   40-64     (los DOS dictados por Erick)
--     99387  ←   99397  ←   65+       (los DOS dictados por Erick)
--
-- ⚠️ La primera versión de esta propuesta tenía la serie de ESTABLECIDOS corrida
-- un lugar (99391 como "1-4", 99392 como "5-11"…). Con eso, a un chico de 6 años
-- se le habría cobrado el código de un adolescente. Se corrigió alineando las
-- dos series contra los seis que ya estaban dictados; es el único motivo por el
-- que se puede afirmar el tramo sin inventarlo.
--
-- Las tarifas NO se tocan — solo el texto.

BEGIN;

-- Paciente NUEVO
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Under Age 1', "longDescription" = NULL WHERE code = '99381' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 1-4'                             WHERE code = '99382' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 5-11'                            WHERE code = '99383' AND "deletedAt" IS NULL;

-- Paciente ESTABLECIDO
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Under Age 1'                 WHERE code = '99391' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 1-4'                     WHERE code = '99392' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 5-11'                    WHERE code = '99393' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 12-17'                   WHERE code = '99394' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 18-39', "longDescription" = NULL WHERE code = '99395' AND "deletedAt" IS NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN — las 8 filas con `ok` en true.
-- Compara contra el texto esperado, no contra heurísticas.
-- ============================================================
WITH esperado(code, texto) AS (VALUES
  ('99381', 'Wellness Exam, New PT, Under Age 1'),
  ('99382', 'Wellness Exam, New PT, Age 1-4'),
  ('99383', 'Wellness Exam, New PT, Age 5-11'),
  ('99391', 'Wellness Exam, Established PT, Under Age 1'),
  ('99392', 'Wellness Exam, Established PT, Age 1-4'),
  ('99393', 'Wellness Exam, Established PT, Age 5-11'),
  ('99394', 'Wellness Exam, Established PT, Age 12-17'),
  ('99395', 'Wellness Exam, Established PT, Age 18-39')
)
SELECT e.code, s."shortDescription", s."currentFee",
       (s."shortDescription" = e.texto) AS ok
FROM esperado e
LEFT JOIN service_codes s ON s.code = e.code AND s."deletedAt" IS NULL
ORDER BY e.code;

-- La familia entera, para leerla de un vistazo y confirmar que no quedó ningún
-- tramo repetido ni salteado.
SELECT code, "currentFee", "shortDescription"
FROM service_codes
WHERE code BETWEEN '99381' AND '99397' AND "deletedAt" IS NULL
ORDER BY code;
