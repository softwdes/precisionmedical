-- ============================================================
-- ⚠️ PROPUESTA — QUE DEVIN LA LEA ANTES DE CORRERLA
-- 18 descripciones que la importación del Excel dejó corrompidas
-- 2026-09-16
-- ============================================================
--
-- ── POR QUÉ ESTE ARCHIVO ES DISTINTO A LOS OTROS TRES ──────────────────────
--
-- Los anteriores escribieron textos que DICTÓ Erick. **Estos los escribí yo**, a
-- partir del código y de lo que quedó legible del texto roto. Son códigos de
-- facturación: si una descripción está mal, alguien elige el código equivocado.
-- Por eso el archivo se entrega para LEER primero, no para correr de una.
--
-- Son 18 líneas. La columna de la izquierda es lo que hay hoy; la de la derecha,
-- lo que quedaría.
--
-- ── POR QUÉ NO SE PUDO RECUPERAR EL TEXTO ORIGINAL ─────────────────────────
--
-- La importación entretejió, letra por letra, la cadena "CH" y el PRECIO dentro
-- de la descripción:
--
--     APO9N0E.0U0ROSIS   →  "APONEUROSIS" con "90.00" adentro
--     PRE1V3E5.N0T0ION   →  "PREVENTION" con "135.00" adentro
--
-- Se intentó revertirlo mecánicamente (sacar en orden los caracteres de "CH" y
-- del precio). **No funciona**: el proceso SOBRESCRIBIÓ caracteres, no solo los
-- insertó. Al limpiar quedan palabras mutiladas — "INJECTION" sale "INJETION",
-- "ARTHROCENTESIS" sale "ARTROENTESIS". La información está PERDIDA, no
-- desordenada. Por eso hay que escribirlas, y por eso las escribe una persona.
--
-- Además varias venían ya truncadas en el Excel ("(EG, PLANTAR", "SPECIF",
-- "INTERPRETATI"), así que ni un texto perfecto se podía deducir del original.
--
-- ── QUÉ QUEDA ──────────────────────────────────────────────────────────────
--
-- Nombres cortos y legibles para el selector de cobro — no la redacción oficial
-- del AMA. `longDescription` se pone en NULL: ahí iría el texto oficial completo,
-- que no tenemos, y dejar el corrompido es justo lo que este archivo viene a
-- sacar.

BEGIN;

-- Inyecciones y procedimientos
UPDATE service_codes SET "shortDescription" = 'Injection, Tendon Sheath / Ligament / Aponeurosis',  "longDescription" = NULL WHERE code = '20550' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Arthrocentesis, Small Joint or Bursa',               "longDescription" = NULL WHERE code = '20600' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Metatarsal Fracture, Closed Treatment w/ Manipulation', "longDescription" = NULL WHERE code = '28475' AND "deletedAt" IS NULL;

-- Radiología
UPDATE service_codes SET "shortDescription" = 'X-Ray, Chest, 2 Views',                              "longDescription" = NULL WHERE code = '71020' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'X-Ray, Shoulder, 1 View',                            "longDescription" = NULL WHERE code = '73020' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'X-Ray, Shoulder, Complete, 2+ Views',                "longDescription" = NULL WHERE code = '73030' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'X-Ray, Ankle, Complete, 3+ Views',                   "longDescription" = NULL WHERE code = '73610' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'X-Ray, Foot, Complete, 3+ Views',                    "longDescription" = NULL WHERE code = '73630' AND "deletedAt" IS NULL;

-- Laboratorio
UPDATE service_codes SET "shortDescription" = 'Glucose, Blood, Handheld Monitoring Device',         "longDescription" = NULL WHERE code = '82962' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Culture, Bacterial, w/ Isolation and Identification', "longDescription" = NULL WHERE code = '87088' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Ova and Parasites, Smear, Concentration and ID',     "longDescription" = NULL WHERE code = '87177' AND "deletedAt" IS NULL;

-- Cardiología
UPDATE service_codes SET "shortDescription" = 'EKG, 12-Lead, w/ Interpretation and Report',         "longDescription" = NULL WHERE code = '93000' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'EKG, 12-Lead, Interpretation and Report Only',       "longDescription" = NULL WHERE code = '93010' AND "deletedAt" IS NULL;

-- Otros
UPDATE service_codes SET "shortDescription" = 'Specimen Handling, Office to Outside Lab',           "longDescription" = NULL WHERE code = '99000' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Nursing Facility Discharge, 30 Min or Less',         "longDescription" = NULL WHERE code = '99315' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Nursing Facility Discharge, More Than 30 Min',       "longDescription" = NULL WHERE code = '99316' AND "deletedAt" IS NULL;
UPDATE service_codes SET "shortDescription" = 'Drug Not Otherwise Classified, Administered via DME', "longDescription" = NULL WHERE code = 'J7799' AND "deletedAt" IS NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN — ninguna fila puede quedar con el precio incrustado.
-- ============================================================
SELECT
  code,
  "currentFee",
  "shortDescription",
  ("shortDescription" !~ '[A-Za-z][0-9]+\.[0-9]+[A-Za-z]') AS ok
FROM service_codes
WHERE code IN ('20550','20600','28475','71020','73020','73030','73610','73630',
               '82962','87088','87177','93000','93010','99000','99315','99316','J7799')
  AND "deletedAt" IS NULL
ORDER BY code;

-- Cuántas descripciones corrompidas quedan en TODO el catálogo. Tiene que dar 0.
SELECT COUNT(*) AS descripciones_aun_corrompidas
FROM service_codes
WHERE "deletedAt" IS NULL AND "shortDescription" ~ '[A-Za-z][0-9]+\.[0-9]+[A-Za-z]';
