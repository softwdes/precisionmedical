-- ════════════════════════════════════════════════════════════════════════════
-- Scott Rigdon vuelve al selector
--
-- El 2026-09-14 se apagó junto con Devin Clanton y Mark Stouffer en
-- 17-apagar-catalogos-de-prueba.sql, bajo el criterio de "providers reales con
-- muy poco uso". Con Scott ese criterio estuvo mal: 25 citas y la última hacía
-- seis meses no es poco uso, es una agenda tranquila. Erick lo confirmó el
-- mismo día: "si era real".
--
-- ── No hay nada que recuperar ──────────────────────────────────────────────
-- Apagar era `status = 'INACTIVE'` y nada más: `deletedAt` quedó en NULL y sus
-- 25 citas —de junio de 2024 a marzo de 2026— nunca se tocaron. Verificado
-- antes de escribir esto. Lo único que cambia es que vuelve a la lista.
--
-- Esa es la razón por la que aquel script desactivaba en vez de borrar, y esta
-- corrección es la prueba de que valía la pena: un error de criterio sobre una
-- persona real se deshace con un UPDATE en vez de con una restauración.
--
-- Mark Stouffer NO se toca: su última cita es de octubre de 2024.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/21-restablecer-scott-rigdon.sql
-- ════════════════════════════════════════════════════════════════════════════

UPDATE providers
   SET status = 'ACTIVE', "updatedAt" = now() AT TIME ZONE 'UTC'
 WHERE email = 'srigdon@precisionmedicalcare.com'
   AND "deletedAt" IS NULL;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Esperado: 7 providers activos — Broadhead, Barry Clanton, Devin Clanton, Gay,
-- Loder, Miller, Nielsen y Rigdon.
--
-- SELECT "firstName", "lastName", status::text FROM providers
--  WHERE status = 'ACTIVE' AND "deletedAt" IS NULL ORDER BY "lastName";
