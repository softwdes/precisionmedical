-- users.crew — grupo de trabajo, para separar el ranking de Métricas.
--
-- Por qué: la Carrera se corre por acciones por hora ACTIVA. Un dev probando
-- módulos enteros marca 47 acc/h porque ese es su trabajo, no porque le gane a
-- recepción. Con todos en la misma pista el ranking de la clínica no significa
-- nada, y los KPI de portada ("41 citas creadas") presentan pruebas como
-- producción.
--
-- Dónde: el valor que MANDA es el del proyecto ADMIN (ztyahz…), que es donde
-- vive `employees` y el "quién es quién". En Phoenix (kiqlhw…) la columna se
-- crea igual para que un `prisma db push` no la borre del schema compartido,
-- pero queda en NULL: una sola fuente de verdad.
--
-- OJO con correr esto en el proyecto equivocado: Phoenix tiene sus PROPIAS
-- tablas `employees` (8 filas, todas Medical Staff) y `departments` (Front Desk,
-- Operations, Medical Staff, IT/Tech, Administration, Finance) — un catálogo
-- distinto y desconectado del de Admin. Por eso el UPDATE de abajo no falla
-- allá: matchea 8 doctores y los etiqueta mal en silencio. De ahí que el CASE
-- termine en NULL y no en un valor por defecto.

-- ── Ambos proyectos ──────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS crew text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_crew_check;
ALTER TABLE users ADD CONSTRAINT users_crew_check
  CHECK (crew IS NULL OR crew IN ('CLINIC', 'DEV', 'COMMS'));

-- ── Solo en ADMIN (ztyahz…) ─────────────────────────────────────────────────
-- Backfill desde el departamento del empleado, que ya está bien cargado.
UPDATE users u SET crew = CASE d.name
    WHEN 'Tecnologia'     THEN 'DEV'
    WHEN 'Marketing'      THEN 'COMMS'
    WHEN 'Clinica'        THEN 'CLINIC'
    WHEN 'Administracion' THEN 'CLINIC'
    ELSE NULL   -- sin catch-all: un depto no mapeado se ve, no se disfraza
  END
FROM employees e JOIN departments d ON d.id = e."departmentId"
WHERE lower(e.email) = lower(u.email);

-- Los que NO tienen ficha de empleado, a mano por nombre (2026-08-31,
-- confirmado con Erick). Son empleadas de EEUU de verdad; falta cargarlas en
-- nómina con sus datos reales, pero eso es una decisión de nómina y no cambia
-- nada de esto: crear la ficha NO asigna `crew`.
UPDATE users SET crew = 'CLINIC'
WHERE "deletedAt" IS NULL
  AND ("firstName", "lastName") IN (
    ('Beatriz', 'Tabarez'), ('Carolina', 'Salazar'),
    ('Denise', 'Vega'),     ('Pamela', 'Sepulveda'),
    ('Edson',   'Freitas')
  );

-- COMMS son SOLO dos: Ruzvel y Cinthia, las del depto `Marketing` (Bolivia), y
-- probablemente ni usen LM. El backfill por departamento ya las deja bien.

-- ── Verificación ────────────────────────────────────────────────────────────
-- En Admin, sobre los que NO son doctores, tiene que dar
-- CLINIC 7 · DEV 7 · COMMS 2 (+2 en null: Reagin Collyer y Rodolfo Montecinos,
-- que existen en Admin pero no en Phoenix, así que no corren).
-- Si da otra cosa, el backfill no hizo lo que parece.
--   SELECT crew, count(*) FROM users
--   WHERE "deletedAt" IS NULL AND role NOT IN ('DOCTOR','LAWYER','AUDITOR_AI')
--   GROUP BY 1 ORDER BY 2 DESC;
