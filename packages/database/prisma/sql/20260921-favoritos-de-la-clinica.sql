-- 20260921 — Los favoritos del catálogo, como en el v2
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- El picker de cargos tiene estrella y filtro "solo favoritos" desde hace
-- meses, pero el grupo nace VACÍO para cada persona: hay que marcar los códigos
-- a mano, uno por uno, cada uno los suyos. Medido el 2026-09-21: **27 favoritos
-- en toda la base, de 3 personas**. La función existe y nadie la mantiene.
--
-- En el v2 no era así: la marca vivía en el SERVICIO (`services.isFavorite`),
-- una sola lista para toda la clínica, y por eso el equipo la usaba. Erick,
-- 2026-09-21: "que se respete como v2 porque ya lo trabajan así".
--
-- ⚠️ No existen "los favoritos de Darrell": en el v2 NUNCA fueron por persona.
-- Son 9 y son de todos.
--
-- ── Por qué global y no por persona ─────────────────────────────────────────
--
-- Además de ser lo que hacía el v2, hay un motivo práctico: los favoritos de v3
-- se guardan con el id de **Supabase Auth**, y de las 18 personas que entraron
-- al sistema solo 3 tienen fila en `auth.users` que matchee por correo (Barry,
-- Cassie y Erick). Darrell, Beatriz, Denise, Pamela y Edson —los que cobran—
-- no aparecen. Sembrar por persona cubriría a 3 de 18.
--
-- La estrella personal NO se toca: sigue funcionando y se SUMA a esta lista.
-- El favorito efectivo es "global O mío".
--
-- ── Los 9, y por qué se les cree ────────────────────────────────────────────
--
-- Salen de `services.isFavorite` del export del v2
-- (`Migracion/datos hoy/services_202609120145.csv`, 329 servicios, 9 marcados).
-- Se validan contra nuestros propios datos: **6 de los 8 códigos más cobrados
-- en v3 están en esta lista**. Los dos que faltan son los de no-show, que son
-- penalidades y nadie marcaría como favorito.
--
--   99214 · 99213 · 99204 · 99203   las cuatro consultas de oficina
--   20552 · 20553                   inyecciones de punto gatillo
--   J3301                           Kenalog
--   PMDC                            Direct Care Visit
--   99298                           Selfpay
--
-- Los 9 existen hoy en `service_codes` (verificado). Ninguno es de efectivo.
--
-- ── La columna va en las DOS tablas ─────────────────────────────────────────
--
-- El picker busca sobre los dos catálogos a la vez y no quiere saber de cuál
-- salió cada ítem. Si la marca viviera solo en `service_codes`, el lado de
-- efectivo no podría tener favoritos nunca y haría falta otra migración el día
-- que se quiera uno. `catalog_items` queda en `false`: hoy el v2 no marcó
-- ninguno de efectivo.
--
-- Idempotente: `IF NOT EXISTS` en la columna y el UPDATE filtra por el valor,
-- así que correrlo dos veces no cambia nada la segunda.
--
-- ⚠️ Se aplica con `node scripts/apply-sql.cjs prisma/sql/20260921-favoritos-de-la-clinica.sql`.
--    `prisma db execute` no habla con el pooler.

ALTER TABLE "service_codes"
  ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "catalog_items"
  ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "service_codes"."isFavorite" IS
  'Favorito de LA CLÍNICA, no de una persona — igual que services.isFavorite del v2. Se muestra arriba en el picker de cargos para todos. La estrella por usuario (user_service_favorites) se suma a esto, no lo reemplaza.';

COMMENT ON COLUMN "catalog_items"."isFavorite" IS
  'Ver service_codes.isFavorite. Hoy ninguno está marcado: el v2 solo marcó códigos de seguro.';

-- Los 9 del v2.
UPDATE "service_codes"
   SET "isFavorite" = true
 WHERE "code" IN ('20552', '20553', '99203', '99204', '99213', '99214', '99298', 'J3301', 'PMDC')
   AND "isFavorite" = false;

-- ── Para verificar ──────────────────────────────────────────────────────────
--
--   SELECT code, "shortDescription", "currentFee"
--     FROM service_codes WHERE "isFavorite" ORDER BY code;
--
-- Esperado: 9 filas.
