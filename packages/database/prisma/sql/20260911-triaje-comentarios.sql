-- Comentario de altura y de peso en el triaje.
--
-- Replica el campo `Comment` que el sistema viejo (MedUSA) tiene debajo de
-- Height: ahí la asistente anota cómo se tomó la medida —"de pie, sin
-- zapatos", "acostado por el collar cervical", "no se pudo pesar en silla"— y
-- eso cambia cómo se lee el número. Hoy ese contexto se pierde o termina
-- metido en el motivo de consulta.
--
-- Decisión de Erick, 2026-09-11: uno para altura y otro para peso, no uno
-- general. Son dos mediciones distintas y la salvedad de una no explica la otra.
--
-- `TEXT` y no `VARCHAR(n)`: en Postgres no hay diferencia de rendimiento y un
-- tope arbitrario obliga a una migración el día que alguien escriba de más. El
-- límite real se pone en el formulario, que es donde se puede avisar.
--
-- Nulos y sin default: un triaje viejo no tiene comentario, y "" no es lo mismo
-- que "no se anotó nada".
--
-- Idempotente por `IF NOT EXISTS`.

ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS "heightComment" TEXT;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS "weightComment" TEXT;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Tiene que devolver las dos filas, las dos con is_nullable = YES.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'triage_records'
   AND column_name IN ('heightComment', 'weightComment')
 ORDER BY column_name;
