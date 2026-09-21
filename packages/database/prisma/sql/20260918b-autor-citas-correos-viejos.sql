-- 20260918b — Los dos autores que el backfill no pudo vincular
--
-- Complemento de `20260918-autor-de-las-citas-del-v2.sql`. Ese script dejó
-- 2.675 citas con nombre y 896 con usuario; el resto quedó con el nombre de
-- respaldo porque el correo del v2 no existe en `users`. Medido después de
-- correrlo:
--
--   Denise Aida        1.069 citas   0 con usuario
--   Pamela Sepulveda     706 citas   0 con usuario   (otras 43 sí matchearon)
--   Calypso Gray           4 citas   0 con usuario
--
-- La causa es que en el v2 esas personas tenían OTRO correo:
--
--   v2                                        v3
--   adia@precisionmedical3.onmicrosoft.com →  denisse@precisionmedicalcare.com
--   pamela@precisionmedicalcare.com        →  pam@precisionmedicalcare.com
--   calypso@precisionmedicalcare.com       →  (no tiene cuenta)
--
-- Calypso queda como está, y está bien: sin cuenta en v3 no hay a qué
-- vincularla, y el nombre solo ya cumple el propósito del campo —saber a quién
-- preguntarle—.
--
-- ── El nombre también se normaliza ──────────────────────────────────────────
--
-- Misma regla que el script original: cuando el correo matchea, el nombre sale
-- de `users`. Por eso "Denise Aida" pasa a "Denise Vega". No es un cambio de
-- criterio: hoy la lista de autores la muestra DOS VECES —1.069 como Aida y 2
-- como Vega, estas últimas de citas nacidas en v3 con su usuario— y son la
-- misma persona vista por dos caminos.
--
-- ── Denise: son la misma persona, confirmado ────────────────────────────────
--
-- El dato sugería que sí —es la única Denise del sistema y el correo del v2 es
-- de un tenant viejo (`onmicrosoft.com`)— pero **cambia de apellido**, y eso no
-- se prueba con una consulta. Son 1.069 citas que quedan atribuidas a una
-- persona con nombre y apellido, así que se preguntó.
--
-- Erick, 18-sep-2026: "son la misma persona, Denise Vega es la que usa el
-- sistema, ese es el correcto". Por eso el nombre se normaliza a Vega y no al
-- revés: manda la identidad con la que trabaja hoy.
--
-- Pamela nunca tuvo esa duda: mismo nombre y apellido, mismo dominio, y `pam@`
-- es el alias de `pamela@`.
--
-- Idempotente: solo toca filas que hoy están sin usuario. Correrlo dos veces
-- no cambia nada la segunda.
--
-- ⚠️ Se aplica con `node scripts/apply-sql.cjs prisma/sql/20260918b-autor-citas-correos-viejos.sql`
--    o pegándolo en el editor SQL. `prisma db execute` no habla con el pooler.

-- ── 1 · Denise — 1.069 citas ────────────────────────────────────────────────
UPDATE "appointments" a
   SET "createdByUserId" = u."id",
       "createdByName"   = TRIM(CONCAT(u."firstName", ' ', u."lastName"))
  FROM "users" u
 WHERE lower(u."email") = lower('denisse@precisionmedicalcare.com')
   AND a."createdByUserId" IS NULL
   AND a."createdByName"   = 'Denise Aida';

-- ── 2 · Pamela — 706 citas ──────────────────────────────────────────────────
UPDATE "appointments" a
   SET "createdByUserId" = u."id",
       "createdByName"   = TRIM(CONCAT(u."firstName", ' ', u."lastName"))
  FROM "users" u
 WHERE lower(u."email") = lower('pam@precisionmedicalcare.com')
   AND a."createdByUserId" IS NULL
   AND a."createdByName"   = 'Pamela Sepulveda';

-- ── Para verificar después de correrlo ──────────────────────────────────────
--
-- Esperado: Denise Vega 1.071 (1.069 + las 2 que ya tenía) y Pamela Sepulveda
-- 749, las dos con `con_id` igual al total. "Denise Aida" desaparece.
--
--   SELECT "createdByName",
--          COUNT(*) citas,
--          COUNT(*) FILTER (WHERE "createdByUserId" IS NOT NULL) con_id
--     FROM "appointments"
--    WHERE "createdByName" IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
