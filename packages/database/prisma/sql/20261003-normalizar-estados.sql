-- Normaliza `patients.addressState` al NOMBRE del estado:  'UT' → 'Utah'.
--
-- ── Por qué ────────────────────────────────────────────────────────────────
--
-- En la tabla conviven dos formatos: el NOMBRE, que es lo que escribe el
-- selector de la ficha del paciente, y el CÓDIGO, que trajo la migración del
-- v2. Medido el 2026-10-03: 1.539 con nombre y 2.907 con código.
--
-- Se normaliza al NOMBRE porque es el formato que la app PRODUCE; el código es
-- el que recibió una vez.
--
-- ⚠️ La clínica (`clinics`) guarda el CÓDIGO a propósito, desde otro formulario.
--    Este script NO la toca.
--
-- ⚠️ Ya NO es necesario para que la pantalla funcione: desde el 2026-10-03 el
--    selector de ciudad reconoce las dos formas. Esto es higiene de datos, para
--    que no haya que resolver lo mismo en cada consulta nueva.
--
-- Es idempotente: correrlo dos veces no cambia nada la segunda.
--
-- ── ⚠️ EN QUÉ PROYECTO ─────────────────────────────────────────────────────
--
-- Hay DOS proyectos de Supabase y este SQL es del de **Phoenix**:
--
--     kiqlhwncfqfftaqqvadj        ← ESTE, el de la clínica
--     ztyahz…                      ← el de Admin, NO
--
-- En el equivocado la tabla `patients` existe pero sin estas columnas, así que
-- el error que sale es `column "addressState" does not exist` y parece un
-- problema del script. Para confirmar dónde estás parado, antes de nada:
--
--     SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'patients' AND column_name ILIKE '%address%';
--
-- Tiene que devolver cuatro: addressCity, addressLine1, addressState, addressZip.
--
-- ── Cómo correrlo ──────────────────────────────────────────────────────────
--
--   1. El SELECT de control de abajo, ANTES.
--   2. El UPDATE.
--   3. El mismo SELECT, DESPUÉS: 'como código' tiene que quedar en 2 (los 'AS').
--
-- 'AS' (American Samoa) queda sin tocar a propósito: son 2 filas y ese código
-- no está en el catálogo de la app, así que inventarle un nombre sería peor.

-- ── 1 y 3. Control ─────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE length(trim("addressState")) = 2) AS como_codigo,
  count(*) FILTER (WHERE length(trim("addressState")) > 2) AS como_nombre,
  count(*)                                                 AS total
FROM patients
WHERE "addressState" IS NOT NULL AND "addressState" <> '';

-- ── 2. El cambio ───────────────────────────────────────────────────────────
UPDATE patients p
   SET "addressState" = m.nombre
  FROM (VALUES
    ('AL','Alabama'),       ('AK','Alaska'),        ('AZ','Arizona'),
    ('AR','Arkansas'),      ('CA','California'),    ('CO','Colorado'),
    ('CT','Connecticut'),   ('DE','Delaware'),      ('FL','Florida'),
    ('GA','Georgia'),       ('HI','Hawaii'),        ('ID','Idaho'),
    ('IL','Illinois'),      ('IN','Indiana'),       ('IA','Iowa'),
    ('KS','Kansas'),        ('KY','Kentucky'),      ('LA','Louisiana'),
    ('ME','Maine'),         ('MD','Maryland'),      ('MA','Massachusetts'),
    ('MI','Michigan'),      ('MN','Minnesota'),     ('MS','Mississippi'),
    ('MO','Missouri'),      ('MT','Montana'),       ('NE','Nebraska'),
    ('NV','Nevada'),        ('NH','New Hampshire'), ('NJ','New Jersey'),
    ('NM','New Mexico'),    ('NY','New York'),      ('NC','North Carolina'),
    ('ND','North Dakota'),  ('OH','Ohio'),          ('OK','Oklahoma'),
    ('OR','Oregon'),        ('PA','Pennsylvania'),  ('RI','Rhode Island'),
    ('SC','South Carolina'),('SD','South Dakota'),  ('TN','Tennessee'),
    ('TX','Texas'),         ('UT','Utah'),          ('VT','Vermont'),
    ('VA','Virginia'),      ('WA','Washington'),    ('WV','West Virginia'),
    ('WI','Wisconsin'),     ('WY','Wyoming'),       ('DC','District of Columbia')
  ) AS m(codigo, nombre)
 WHERE upper(trim(p."addressState")) = m.codigo;
