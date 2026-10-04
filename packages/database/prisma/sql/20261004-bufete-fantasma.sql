-- 20261004 — Sacar del catálogo el "bufete" NO ATTORNEY YET
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
--
-- El 2026-10-03 a las 00:38 nació en el catálogo de externos un bufete llamado
-- **"NO ATTORNEY YET"**. No es un error de tipeo: es exactamente lo que alguien
-- quiso anotar —"este paciente todavía no tiene abogado"— escrito en la celda
-- del BUFETE de la vista de seguimiento, donde el alta rápida
-- (`lawyers/quick-create-firm`, via:"seguimiento") lo creó sin chistar.
--
-- El audit log lo tiene: CREATE_LAWYER_FIRM con `{"via":"seguimiento"}`, y el
-- único caso que lo apunta es MVA-3463.
--
-- La culpa es de la función, no de quien la usó. El alta rápida se agregó ese
-- mismo día para que Edson pudiera cargar un bufete sin salir de la grilla, y
-- no tiene forma de distinguir un bufete de una nota: toma lo que se escribe y
-- lo guarda en un catálogo que comparten facturación, el portal legal y los
-- reportes.
--
-- ── Alcance, medido antes de tocar nada ─────────────────────────────────────
--
--   bufetes con ese nombre .............. 1  (cmurnygcm0004hihc3nqvmfnj)
--   casos que lo apuntan ................ 1  (MVA-3463)
--   personas colgadas de él ............. 0
--   filas en case_managers .............. 0
--
-- ── Qué hace, y qué NO hace ─────────────────────────────────────────────────
--
--  1. Le saca el bufete a MVA-3463 (`lawFirmId = NULL`), que es la verdad: ese
--     caso no tiene bufete.
--  2. Marca el bufete como borrado. LÓGICO y no `DELETE`, igual que los
--     documentos (2026-09-13) y las citas (2026-09-23): la fila se marca, no se
--     va, así el audit log del día que se creó sigue resolviendo contra algo.
--
-- **NO toca `attorneyNameRaw`.** MVA-3463 tiene ahí "NO ATTORNEY YET" y eso se
-- QUEDA: es la anotación que Edson quiso dejar, está en el campo correcto —el
-- abogado escrito a mano— y la grilla la sigue mostrando. Lo que sobraba era el
-- bufete, no el dato.
--
-- ── Lo que queda abierto ────────────────────────────────────────────────────
--
-- Esto limpia el síntoma de hoy. La puerta sigue abierta: cualquiera puede
-- volver a escribir una nota en la celda del bufete y crear otro. Si vuelve a
-- pasar, el arreglo no es otro SQL — es que el alta rápida pida confirmación
-- cuando el texto no se parece a un nombre de bufete, o que el catálogo tenga
-- dónde fusionar y archivar desde la pantalla de Externos.

BEGIN;

-- 1 · El caso se queda sin bufete, que es lo que realmente pasa.
UPDATE cases
   SET "lawFirmId" = NULL,
       "updatedAt" = NOW()
 WHERE "lawFirmId" IN (
         SELECT id FROM lawyers
          WHERE "entityType" = 'FIRM'
            AND "deletedAt" IS NULL
            AND upper(trim("firmName")) = 'NO ATTORNEY YET'
       );

-- 2 · El bufete sale del catálogo sin desaparecer de la base.
UPDATE lawyers
   SET "deletedAt" = NOW(),
       "updatedAt" = NOW()
 WHERE "entityType" = 'FIRM'
   AND "deletedAt" IS NULL
   AND upper(trim("firmName")) = 'NO ATTORNEY YET';

COMMIT;

-- ── Para verificar después ──────────────────────────────────────────────────
--
-- SELECT "firmName", "deletedAt" FROM lawyers WHERE "firmName" ILIKE 'NO ATTORNEY%';
--   → una fila, con fecha en deletedAt
-- SELECT "caseCode", "lawFirmId", "attorneyNameRaw" FROM cases WHERE "caseCode" = 'MVA-3463';
--   → lawFirmId NULL y attorneyNameRaw intacto
