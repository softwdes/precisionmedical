-- ============================================================
-- Descripciones de los códigos de bienestar + 20610
-- Pedido de Erick, 2026-09-16. Correr en el editor SQL de Supabase.
-- ============================================================
--
-- QUÉ ARREGLA
--
-- Seis de estos códigos mostraban SU PROPIO NÚMERO como descripción: quien
-- cobra veía "99396" y nada más, y tenía que saberse de memoria cuál es cuál.
-- Los otros tres estaban peor que vacíos:
--
--   · G0438 tenía la descripción de OTRO código — "ANNUAL ALCOHOL MISUSE
--     SCREENING", que es G0442. Un código de chequeo anual rotulado como
--     tamizaje de alcoholismo.
--   · G0439 tenía el texto CORROMPIDO, con el precio entretejido letra por
--     letra: "PRE1V3E5.N0T0ION" es "PREVENTION" con "135.00" adentro.
--   · 20610 estaba cortado a la mitad: "ARTHROCENTESIS ASPIR".
--
-- Los textos son los que dictó Erick, no una traducción del AMA.
--
-- ⚠️ `longDescription` se pone en NULL en los tres que traían texto malo.
-- Esa columna es para la descripción COMPLETA del AMA y no la tenemos; dejarla
-- con lo que hay sería conservar justo lo que este archivo viene a sacar, y
-- copiarle el texto corto sería inventar que es oficial. Vacía es honesto, y ya
-- hay 76 códigos así. Los otros seis ya la tenían vacía y se quedan igual.
--
-- `fiscalYear` no se filtra a propósito: la clave única es (code, fiscalYear) y
-- hoy hay un solo año cargado. Si mañana hay dos, la descripción del código es
-- la misma en los dos — lo que cambia de un año a otro es la tarifa.

BEGIN;

UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 40-64'          WHERE code = '99396' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, Established PT, Age 65+ Non Medicare' WHERE code = '99397' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 65+ Non Medicare'       WHERE code = '99387' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 40-64'                  WHERE code = '99386' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 18-39'                  WHERE code = '99385' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Wellness Exam, New PT, Age 12-17'                  WHERE code = '99384' AND "deletedAt" IS NULL;

-- Estos tres traían texto equivocado o corrompido: se limpia también el largo.
UPDATE service_codes
   SET "shortDescription" = 'Wellness Exam/Medicare Physical, Initial Exam',
       "longDescription"  = NULL
 WHERE code = 'G0438' AND "deletedAt" IS NULL;

UPDATE service_codes
   SET "shortDescription" = 'Wellness Exam/Medicare Physical, Subsequent Exam',
       "longDescription"  = NULL
 WHERE code = 'G0439' AND "deletedAt" IS NULL;

UPDATE service_codes
   SET "shortDescription" = 'Joint Aspiration/Cortisone Injection',
       "longDescription"  = NULL
 WHERE code = '20610' AND "deletedAt" IS NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN — las 9 filas tienen que salir con `ok` en true.
-- ============================================================
--
-- Compara contra el texto ESPERADO, uno por uno. La primera versión de esta
-- verificación miraba heurísticas ("no es el código", "no tiene el precio
-- adentro", "mide más de 10") y daba **ok = true con los datos VIEJOS** en
-- 20610, G0438 y G0439: "ARTHROCENTESIS ASPIR" pasa las tres. O sea que decía
-- que estaba bien sin que el archivo hubiera corrido.
--
-- Una verificación que aprueba el estado anterior no verifica nada.

WITH esperado(code, texto) AS (VALUES
  ('99396', 'Wellness Exam, Established PT, Age 40-64'),
  ('99397', 'Wellness Exam, Established PT, Age 65+ Non Medicare'),
  ('99387', 'Wellness Exam, New PT, Age 65+ Non Medicare'),
  ('99386', 'Wellness Exam, New PT, Age 40-64'),
  ('99385', 'Wellness Exam, New PT, Age 18-39'),
  ('99384', 'Wellness Exam, New PT, Age 12-17'),
  ('G0438', 'Wellness Exam/Medicare Physical, Initial Exam'),
  ('G0439', 'Wellness Exam/Medicare Physical, Subsequent Exam'),
  ('20610', 'Joint Aspiration/Cortisone Injection')
)
SELECT
  e.code,
  s."shortDescription",
  s."currentFee",
  (s."shortDescription" = e.texto) AS ok
FROM esperado e
LEFT JOIN service_codes s ON s.code = e.code AND s."deletedAt" IS NULL
ORDER BY e.code;
