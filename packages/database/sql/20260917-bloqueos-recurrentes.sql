-- Bloqueos de agenda que se repiten: el almuerzo, la reunión, las vacaciones.
--
-- El botón "Schedule note" del calendario existe desde el 2026-08-20 y tiene
-- CERO filas: nadie lo usó nunca, ni una vez. La causa más probable no era que
-- no bloqueara —eso se decidió a propósito— sino que **no se puede repetir**, y
-- el almuerzo es todos los días: nadie va a crear "Lunch" 250 veces al año.
-- Confirmado con Devin (2026-09-17): *"we do need to have repeating options for
-- blocks so they can just add in recurring things like lunch on there"*.
--
-- ── Una REGLA en la fila, no 250 filas ──────────────────────────────────────
--
-- Se evaluó materializar una fila por día. No: eso necesita un horizonte y un
-- proceso que lo estire, y el día que el horizonte se queda corto **el almuerzo
-- desaparece solo, en marzo, sin que nadie toque nada**. Eso es peor que no
-- tener la función. Con una regla, un año de almuerzos es UNA fila, y cambiarlo
-- a las 12:30 para siempre es UNA edición.
--
-- ── Por qué no hace falta una columna de "todo el día" ──────────────────────
--
-- Las vacaciones y la licencia son días COMPLETOS, y se expresan con lo que ya
-- hay: `durationMinutes` = 600 cubre el horario de atención entero (08:00-18:00,
-- ver `OPEN_MIN`/`CLOSE_MIN`) y `repeatMode = WEEKDAYS` con `repeatUntil` en el
-- último día las estira. Una semana afuera son 600 minutos y una fecha de fin,
-- no siete columnas nuevas.
--
-- ── Lo que este cambio NO trae ──────────────────────────────────────────────
--
-- Saltear UN día de una regla ("hoy no hay almuerzo"). No hace falta, y es
-- consecuencia directa de la otra decisión de Devin: el bloqueo **avisa y deja
-- pasar**, no impide. Para el día que no hay almuerzo, se agenda encima y se
-- acepta el aviso. Un bloqueo DURO sí habría necesitado la excepción desde el
-- primer día, porque frenar una urgencia sin escape deja a alguien sin poder
-- agendar a un paciente que ya está en la sala.
--
-- Corolario a tener presente: borrar un bloqueo repetido borra TODOS sus días.
-- No hay "borrar solo el de hoy". Si lo piden, ahí se agrega la excepción.
--
-- ORDEN: primero el tipo, después las columnas. Y el `ALTER TYPE` va SUELTO,
-- sin BEGIN/COMMIT: Postgres no deja usar un valor de enum en la misma
-- transacción en que se lo crea.
--
-- Idempotente: correrlo dos veces no rompe nada.

-- ─── 1. El tipo ─────────────────────────────────────────────────────────────
--
-- `WEEKDAYS` y no `DAILY` a propósito: la clínica no atiende sábado ni domingo
-- (ver `isWeekendInDenver` en `lib/scheduling-rules.ts`), así que un almuerzo
-- pintado el sábado es ruido. `WEEKLY` repite el MISMO día de la semana que
-- `startsAt` — la reunión de los martes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BlockRepeat') THEN
    CREATE TYPE "BlockRepeat" AS ENUM ('NONE', 'WEEKDAYS', 'WEEKLY');
  END IF;
END $$;

-- ─── 2. Las columnas ────────────────────────────────────────────────────────
--
-- `repeatMode` arranca en NONE para las filas que ya existan: hoy son cero,
-- pero el default tiene que ser el comportamiento de siempre igual — el que
-- crea un aviso de una sola vez no eligió repetirlo.
ALTER TABLE provider_time_blocks
  ADD COLUMN IF NOT EXISTS "repeatMode" "BlockRepeat" NOT NULL DEFAULT 'NONE';

-- `NULL` = para siempre, y es lo que quiere el almuerzo: nadie va a renovarlo
-- cada enero. Sin zona horaria, como el resto de la tabla — estas columnas
-- guardan UTC y Prisma las lee como UTC.
ALTER TABLE provider_time_blocks
  ADD COLUMN IF NOT EXISTS "repeatUntil" TIMESTAMP(3);

-- ─── 3. Índice ──────────────────────────────────────────────────────────────
--
-- El calendario ya pide por rango de fechas, pero una regla repetida NO se
-- puede filtrar por `startsAt` dentro del rango: `startsAt` es sólo la PRIMERA
-- vez, así que un almuerzo creado en septiembre dejaría de verse en octubre. La
-- consulta tiene que traer **todas las reglas vivas** y expandirlas, y este
-- índice es para esa lectura.
CREATE INDEX IF NOT EXISTS "provider_time_blocks_repeatMode_repeatUntil_idx"
  ON provider_time_blocks ("repeatMode", "repeatUntil");

-- ─── Verificación ───────────────────────────────────────────────────────────
-- Tienen que salir los 3 valores del tipo y las 2 columnas nuevas.
SELECT
  (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
     FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BlockRepeat')                              AS valores_del_tipo,
  (SELECT string_agg(column_name, ', ' ORDER BY column_name)
     FROM information_schema.columns
    WHERE table_name = 'provider_time_blocks'
      AND column_name IN ('repeatMode', 'repeatUntil'))           AS columnas_nuevas,
  (SELECT COUNT(*) FROM provider_time_blocks)                     AS bloqueos_existentes;
