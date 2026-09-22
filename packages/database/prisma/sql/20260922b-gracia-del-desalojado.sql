-- 20260922b — El desalojado alcanza a guardar lo último que escribió
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Cuando un provider desaloja de la nota a alguien de la clínica, lo que ese
-- alguien tenía SIN GUARDAR ya no se puede guardar nunca. El texto sigue en la
-- pantalla —no desaparece— pero el siguiente autoguardado vuelve 409
-- `NOTE_LOCKED` y a partir de ahí no hay dónde ponerlo: si cierra la pestaña,
-- se perdió. La única salida hoy es copiarlo a mano.
--
-- Se documentó como "la ventana de 2,5 segundos" porque ese es el debounce del
-- autoguardado. Erick, 2026-09-22: **cerrarla**.
--
-- ── Cómo se cierra ──────────────────────────────────────────────────────────
--
-- La nota recuerda a QUIÉN desalojó y CUÁNDO. Con eso, el PUT le acepta al
-- desalojado **un guardado tardío** dentro de la gracia, aunque el candado ya
-- no sea suyo. Pasada la gracia, vuelve a rechazarlo.
--
-- ⚠️ No hay riesgo de que pise lo que escribió el provider que entró: ese
-- guardado tardío viaja con su `baseUpdatedAt`, y el control de versión que ya
-- existe lo convierte en `STALE_NOTE` si el provider guardó primero. O sea que
-- el peor caso no es "se sobreescribió": es el cartel de conflicto que la
-- pantalla ya sabe mostrar, con los dos textos y el usuario eligiendo.
--
-- Por eso alcanza con dos columnas y ni una tabla nueva: el mecanismo de
-- seguridad ya estaba construido, lo único que faltaba era saber a quién
-- dejarle intentar.
--
-- ── Cómo se aplica ──────────────────────────────────────────────────────────
--
--   node scripts/apply-sql.cjs prisma/sql/20260922b-gracia-del-desalojado.sql
--
-- Idempotente. No crea tablas, no borra nada, no toca una sola fila existente.

ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "desalojadoAUserId" text;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "desalojadoEn"      timestamp(3);

COMMENT ON COLUMN visit_notes."desalojadoAUserId" IS
  'A quién le sacó la nota el último desalojo por provider. Junto con desalojadoEn le da una gracia corta para guardar lo que tenía escrito, aunque el candado ya no sea suyo. Ver prisma/sql/20260922b-gracia-del-desalojado.sql';
