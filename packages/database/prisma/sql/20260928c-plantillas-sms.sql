-- 20260928c — plantillas de SMS editables por la clinica
--
-- ── Que resuelve ────────────────────────────────────────────────────────────
--
-- El texto de los mensajes automaticos vive en el codigo. Cada vez que la
-- clinica quiere cambiar una palabra hace falta un deploy, asi que no lo pide:
-- se queda con el texto que haya. Erick (2026-09-28): que lo editen ellas, en
-- los dos idiomas.
--
-- ── Por que la ausencia de fila ES el default ───────────────────────────────
--
-- La tabla guarda SOLO lo editado. El texto original sigue en
-- `apps/back-office/lib/plantillas-sms.ts`, y una prueba verifica que rinda
-- identico a las funciones que mandan hoy (52 combinaciones de idioma, paciente
-- nombrado, direccion, telefono, telemedicina y enlace: las 52 en verde).
--
-- Si en vez de eso la tabla naciera con una copia del default, esa copia
-- quedaria vieja el dia que alguien toque el codigo, y la pantalla mostraria la
-- copia como si fuera lo que sale. Con este diseño "restaurar el original" es
-- un DELETE y no puede desincronizarse.
--
-- ── Por que `key` es texto y no un enum ─────────────────────────────────────
--
-- Agregar un mensaje nuevo al catalogo no deberia necesitar una migracion ni
-- coordinar el orden entre el deploy y el SQL. La lista valida vive en el
-- codigo (`CLAVES_PLANTILLA`) y la valida la API; la base solo guarda.
--
-- ── Lo que NO se guarda aca ─────────────────────────────────────────────────
--
-- El cierre legal (HELP/STOP) lo pega el codigo y queda fuera del editor. Lo
-- exige el operador: si alguien lo borra, el carrier filtra los mensajes y
-- llegan como "no entregado" con el error 30007, indistinguible de "el paciente
-- lo ignoro".
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20260928c-plantillas-sms.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sms_templates (
  id                TEXT PRIMARY KEY,
  key               TEXT NOT NULL,
  lang              TEXT NOT NULL,
  body              TEXT NOT NULL,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedByUserId" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_templates_key_lang_key"
  ON sms_templates (key, lang);

COMMENT ON TABLE sms_templates IS
  'Texto EDITADO de los mensajes automaticos. Sin fila = se usa el original del codigo (lib/plantillas-sms.ts). Restaurar el original = borrar la fila.';

-- ⚠️ Los GRANT se pierden al crear una tabla a mano: sin esto anda por Prisma y
-- falla por REST con 42501. Ya paso dos veces en esta base.
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_templates TO service_role;
GRANT SELECT ON sms_templates TO authenticated;

COMMIT;
