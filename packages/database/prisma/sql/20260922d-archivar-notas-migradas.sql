-- 20260922d — Archivar las notas que entraron con la migración
--
-- ⚠️ CORRER DESPUÉS de `20260922c`, que agrega el valor 'ARCHIVED'. Van
-- separados porque PostgreSQL no deja usar un valor de enum en la misma
-- transacción en que se lo agrega.
--
-- ── A cuáles alcanza, y por qué NO son 165 ──────────────────────────────────
--
-- Erick pidió archivar "los 165 borradores". Midiendo antes de escribir, los
-- borradores se parten en dos grupos que **no se pueden tratar igual**:
--
--   161  MIGRADAS         creadas entre 2025-09-22 y 2026-09-01,
--                         TODAS con `updatedAt` = 2026-09-12 — el sello de la
--                         corrida de migración, que las tocó una vez y nunca más.
--
--     5  NACIDAS EN LM    creadas entre el 14 y el 17 de septiembre de 2026,
--                         cada una con su `updatedAt` propio, tres de ellas con
--                         plantilla de LienMaster.
--
-- Las 5, por paciente: Rodolfo Montecinos (14-sep), Maria Delgado (15-sep),
-- Cassandra McConkie y Darren Potter (16-sep), Isabelle Taylor (17-sep).
--
-- **Esas cinco NO se tocan.** La premisa de Devin —"the providers have not been
-- working in LM yet"— no se cumple del todo: alguien escribió en LienMaster esos
-- cuatro días. Serán pruebas nuestras o no, pero eso lo decide una persona
-- mirándolas, no un UPDATE masivo. Si después se confirma que son pruebas, se
-- archivan de a una.
--
-- ── El discriminador ────────────────────────────────────────────────────────
--
-- `updatedAt::date = 2026-09-12`. No es una fecha elegida a ojo: es la marca que
-- dejó la migración, y separa los dos grupos sin solapamiento — ninguna de las
-- 161 tiene otra fecha y ninguna de las 5 tiene esa.
--
-- Se descartaron otros criterios por imprecisos: el candado (`editingByUserId`)
-- está en NULL en las 166, y `templateId` solo distingue 3.
--
-- ── Qué NO hace ─────────────────────────────────────────────────────────────
--
-- No borra ni vacía nada. El texto, los diagnósticos y los CPT quedan donde
-- están; lo único que cambia es el estado. Se revierte con un UPDATE simétrico.
--
-- ── Cómo se aplica ──────────────────────────────────────────────────────────
--
--   node scripts/apply-sql.cjs prisma/sql/20260922d-archivar-notas-migradas.sql
--
-- Idempotente: al correrlo de nuevo no queda ninguna DRAFT con ese sello.

-- Antes: cuántas va a tocar. Si este número no es 161, PARAR y mirar por qué.
SELECT
  count(*) FILTER (WHERE "updatedAt"::date =  DATE '2026-09-12')::int AS van_a_archivarse,
  count(*) FILTER (WHERE "updatedAt"::date <> DATE '2026-09-12')::int AS se_quedan_como_estan
FROM visit_notes
WHERE status = 'DRAFT';

UPDATE visit_notes
SET status = 'ARCHIVED'
WHERE status = 'DRAFT'
  AND "updatedAt"::date = DATE '2026-09-12';

-- Después: el reparto final.
SELECT status, count(*)::int AS notas
FROM visit_notes
GROUP BY status
ORDER BY 2 DESC;
