-- =============================================================================
-- blocked_ips — la lista de IPs echadas · 2026-10-06 · SOLO PROYECTO **ADMIN**
-- =============================================================================
--
-- ⚠️ ESTA TABLA VA EN EL PROYECTO ADMIN (ztyahz…), NO EN PHOENIX.
--
-- Es donde viven `users` y `audit_logs`, que son las dos cosas con las que se
-- cruza. Correrlo en Phoenix crea una tabla que nadie lee y deja al Admin sin
-- la suya: el síntoma sería que el botón "Bloquear" contesta 404 y nada más.
-- El 2026-10-05 ya pasó exactamente eso con las columnas del candado — se
-- corrieron en `phoenix-dev` y el Admin siguió sin ellas.
--
-- Cómo correrlo: en el editor SQL del panel de Supabase del proyecto Admin.
-- `apply-sql.cjs` NO sirve acá: apunta a Phoenix por `DATABASE_URL`.
-- Es idempotente, se puede correr dos veces sin romper nada.
--
-- ── Qué resuelve ────────────────────────────────────────────────────────────
--
-- Hasta hoy el Centro de Seguridad VE el ataque y no puede pararlo: hay freno
-- por IP (8 reportes y 30 consultas cada 10 minutos) pero nunca una puerta
-- cerrada. Una IP que prueba contraseñas despacio pasa el freno sin despeinarse.
--
-- ── Por qué `timestamptz` y no `timestamp` ──────────────────────────────────
--
-- Porque `audit_logs.createdAt` es `timestamp` SIN zona, PostgREST la devuelve
-- pelada (`2026-10-06T17:56:29.88`) y el navegador la lee como hora LOCAL. Eso
-- puso el Centro de Seguridad a mostrar eventos 279 minutos en el futuro, y
-- Erick lo vio antes que nosotros (2026-10-06). Con `timestamptz` la fecha
-- viaja con su offset y no hay nada que adivinar.
--
-- ── Por qué NO hay bloqueo automático ───────────────────────────────────────
--
-- Medido el 2026-10-06: la IP `76.8.206.26` tiene 11 ingresos buenos y 4
-- fallidos. Es la salida a internet de la clínica — TODO el personal comparte
-- esa dirección. Un bloqueo automático por "4 fallos" deja a la clínica entera
-- afuera en el peor momento del día, y el ataque habría sido alguien que no se
-- acordaba su contraseña.
--
-- Por eso se bloquea A MANO, desde el Centro de Seguridad, y el sistema avisa
-- en vez de actuar solo. Si alguna vez se automatiza, la regla tiene que
-- excluir cualquier IP con ingresos exitosos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "blocked_ips" (
  -- `gen_random_uuid()` y no `cuid()`: el id lo pone la BASE, para que un
  -- insert por REST que lo omita no muera contra el NOT NULL. Es la trampa ya
  -- documentada de `@default(cuid())`, que Prisma resuelve del lado del cliente
  -- y Postgres no conoce.
  "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- La dirección, tal cual la ve el servidor: IPv4 o IPv6 (`::1` incluido).
  -- Se guarda como texto y no como `inet` porque todo el resto del candado la
  -- maneja así, y un solo tipo evita conversiones en cada consulta.
  "ip"          text        NOT NULL,

  -- Por qué se bloqueó. Lo escribe quien aprieta el botón, y es lo único que
  -- va a tener dentro de seis meses el que pregunte "¿y esta por qué está?".
  "motivo"      text,

  "bloqueadaEl" timestamptz NOT NULL DEFAULT now(),

  -- NULL = hasta que alguien la saque. Con fecha = se vence sola, que es lo
  -- correcto para un bloqueo preventivo: nadie se acuerda de limpiar la lista.
  "hasta"       timestamptz,

  -- Quién la bloqueó. Sin REFERENCES, igual que `push_subscriptions`: el resto
  -- del candado trata los ids de usuario como texto suelto.
  "porUserId"   text,

  -- De dónde era, copiado al momento de bloquear. Se guarda acá y no se vuelve
  -- a calcular porque la lista tiene que leerse sin cruzar con nada.
  "pais"        text,
  "ciudad"      text
);

-- Una IP, una fila. El UNIQUE es lo que deja hacer "bloquear" dos veces sin
-- duplicar, y lo que hace barata la consulta de la puerta.
CREATE UNIQUE INDEX IF NOT EXISTS "blocked_ips_ip_key" ON "blocked_ips" ("ip");

-- La puerta pregunta "¿esta IP está bloqueada AHORA?" en cada intento de
-- login, así que el índice cubre las dos columnas de esa pregunta.
CREATE INDEX IF NOT EXISTS "blocked_ips_hasta_idx" ON "blocked_ips" ("hasta");

-- `service_role` escribe y lee; nadie más toca esta tabla. Se concede explícito
-- porque una tabla creada a mano NO hereda los GRANT del resto del esquema, y
-- el síntoma de olvidarlo es que lee bien y falla solo al escribir.
GRANT SELECT, INSERT, UPDATE, DELETE ON "blocked_ips" TO service_role;

-- Sin políticas para `anon` ni `authenticated`: la lista de IPs bloqueadas es
-- justamente lo que no queremos que un atacante pueda leer.
ALTER TABLE "blocked_ips" ENABLE ROW LEVEL SECURITY;
