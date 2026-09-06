-- =============================================================================
-- Snippets de mensajería — paso 2 del plan Settings del portal
-- 2026-09-06 · docs/plan-settings-portal-snippets.md §13
-- =============================================================================
-- Medusa tiene "Send Message Snippets" en My Settings, al lado de los de la
-- nota: al redactar o responder un mensaje, la lista aparece a la izquierda del
-- editor y el clic agrega en el cursor. Acá se hace lo mismo con DOS categorías
-- más de `snippets`, en vez de la tabla aparte `message_templates` que tenía la
-- mensajería: mismo catálogo en Configuración, mismos favoritos, mismo "solo
-- admin borra", mismos campos del paciente.
--
--   MENSAJE_PROVIDER — los temas propios de los providers (instrucciones al
--                      paciente, resultados…). Se administran en el portal.
--   MENSAJE_CLINICA  — los de recepción y cobranza (mensaje telefónico, turnos…).
--                      Se administran en Configuración del back-office.
--
-- Al escribir, cada uno ve los suyos según dónde está (portal / back-office);
-- ADMIN ve los dos grupos. Lo decide la API (`?messageContext=`), no el cliente.
--
-- Historia: el primer intento del día creó UN solo valor `MENSAJE`; Erick pidió
-- separarlos y se RENOMBRÓ (no hay filas de producción, solo 2 pruebas del QA).
--
-- `ALTER TYPE … ADD VALUE` no puede ir dentro de una transacción con sentencias
-- que USEN el valor nuevo: se aplica cada sentencia sola (así lo corre el
-- script de aplicación). Idempotente.
-- =============================================================================

-- Si el valor intermedio existe, se renombra; si no, se crea el definitivo.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"TemplateSectionKey"'::regtype AND enumlabel = 'MENSAJE') THEN
    ALTER TYPE "TemplateSectionKey" RENAME VALUE 'MENSAJE' TO 'MENSAJE_PROVIDER';
  END IF;
END $$;

ALTER TYPE "TemplateSectionKey" ADD VALUE IF NOT EXISTS 'MENSAJE_PROVIDER';
ALTER TYPE "TemplateSectionKey" ADD VALUE IF NOT EXISTS 'MENSAJE_CLINICA';

-- ── Migración de message_templates → snippets (sentencia aparte) ─────────────
-- Las dos filas que existían (2026-09-06) eran pruebas del QA hechas por STAFF,
-- así que van a la clínica. Idempotente: se salta las que ya estén.
--   INSERT INTO snippets ("id","sectionKey","title","description","content","scope",
--                         "createdById","usageCount","isActive","sortOrder","createdAt","updatedAt","deletedAt")
--   SELECT t.id, 'MENSAJE_CLINICA', t.title, NULL, t.body, 'SHARED',
--          t."createdByUserId", 0, true, 0, t."createdAt", t."updatedAt", t."deletedAt"
--     FROM message_templates t
--    WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = t."createdByUserId")
--      AND NOT EXISTS (SELECT 1 FROM snippets s WHERE s.id = t.id);
--   UPDATE snippets SET "sectionKey" = 'MENSAJE_CLINICA'
--    WHERE "sectionKey" = 'MENSAJE_PROVIDER' AND id IN (SELECT id FROM message_templates);
--
-- `message_templates` queda en la base, sin lectores: la API que la usaba se
-- retiró. Se dropea en una limpieza posterior.

-- ── Verificación ────────────────────────────────────────────────────────────
--   SELECT enumlabel FROM pg_enum WHERE enumtypid = '"TemplateSectionKey"'::regtype ORDER BY enumsortorder;
--   SELECT "sectionKey", count(*) FROM snippets GROUP BY 1;
