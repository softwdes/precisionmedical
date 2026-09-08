-- =============================================================================
-- Avisos al celular (Web Push) — 2026-09-08 · PHOENIX
-- =============================================================================
-- Guarda los navegadores que aceptaron recibir avisos, para poder mandarles la
-- notificación cuando la app está CERRADA. Sin esta tabla el aviso solo existe
-- mientras alguien tiene la pestaña abierta, que es justo lo que no servía.
--
-- Una fila por (persona · navegador · dominio), no una por persona: el
-- principal, `providers.*` y `attorney.*` se instalan como TRES PWA distintas,
-- cada una con su propio Service Worker y su propia suscripción. Alguien con la
-- clínica en la laptop y providers en el teléfono tiene dos filas y quiere el
-- aviso en las dos.
--
-- `endpoint` es la identidad real de la suscripción (la URL que da el navegador,
-- FCM en Chrome). Si el navegador la renueva, cambia y la vieja muere — de ahí
-- el UNIQUE ahí y no en (userId, origin): la misma persona puede tener dos
-- navegadores en el mismo dominio.
--
-- `p256dh` y `auth` son las claves con las que se cifra el payload (RFC 8291).
-- Son secretos de la suscripción: sin ellas el push service acepta el envío
-- pero el navegador no puede leerlo.
--
-- `userId` NO lleva REFERENCES a `users`: el módulo de mensajería trata los
-- usuarios de Phoenix como ids sueltos (viven en otro proyecto de Supabase), y
-- esta tabla sigue esa convención. La limpieza de filas huérfanas la hace el
-- borrado por fallos, no la base.
--
-- Aplicar con `node packages/database/scripts/apply-sql.cjs <este archivo>`
-- (`prisma db execute` no habla con el pooler). Idempotente.
-- NO usar `db push`: arrastra la deriva de otras sesiones.
-- =============================================================================

-- El `DEFAULT gen_random_uuid()` no lo conoce Prisma (que manda su cuid): está
-- para que un insert por REST que omita el id no muera — la trampa documentada
-- de `@default(cuid())`, que no existe en la base.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"        text NOT NULL,
  "origin"        text NOT NULL,
  "endpoint"      text NOT NULL,
  "p256dh"        text NOT NULL,
  "auth"          text NOT NULL,
  "userAgent"     text,
  "lastSuccessAt" timestamp(3),
  "failureCount"  integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON "push_subscriptions" ("userId");

NOTIFY pgrst, 'reload schema';
