-- Elimina (logicamente) las citas de prueba, MENOS las de HOY.
--
--   node scripts/apply-sql.cjs packages/database/prisma/sql/20260929-borrar-citas-de-prueba.sql
--
-- Las de hoy se conservan a pedido de Erick: se van a usar para seguir
-- probando. Hoy hay UNA sola, de `Aaron Black Test` a las 09:00.
--
-- ─── POR QUE VA POR SQL Y NO POR LA PANTALLA ────────────────────────────────
--
-- De las 12 citas vivas de prueba, SOLO UNA pasa las guardas del boton de
-- eliminar. Las otras estan bloqueadas por candados que existen a proposito y
-- que NO hay que aflojar: 9 tienen nota de visita, 6 tienen cargos, 8 tienen
-- check-in y 3 tienen firma de asistencia. Esos candados son los que impiden
-- borrar una visita REAL con plata o historia clinica adentro.
--
-- ─── POR QUE SE ELIGE POR PACIENTE Y NO POR EL TEXTO ────────────────────────
--
-- Filtrar por la palabra "test" en la nota BORRARIA CITAS DE PACIENTES REALES:
-- medido, aparece en decenas de notas clinicas legitimas -- STREP TEST, TB
-- TEST, PREGNANCY TEST, BLOOD TEST, STD testing, TESTICULAR PAIN. Y "demo"
-- matchea el apellido DEMOSS de una paciente real.
--
-- Por eso la seleccion es por ID de paciente, fijo y verificado a mano:
--   cmueg5cl800062vuczc2mu0ih  ->  devin test         (3 citas, caso GM-3429)
--   cmuctcow900041022f6tyf17s  ->  Aaron Black Test   (10 citas, caso MVA-3415)
--
-- Los otros 33 pacientes de prueba de la base NO tienen ninguna cita.
--
-- ─── LA ZONA HORARIA, QUE ES DONDE ESTO SE ROMPE ────────────────────────────
--
-- `scheduledFor` es `timestamp WITHOUT time zone` y guarda UTC. Para saber que
-- dia es en la clinica hace falta DOBLE conversion:
--
--     "scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver'
--
-- Con una sola el resultado se corre y el dia puede cambiar: la cita de hoy
-- (20:00 UTC) daba 21:00 en vez de 09:00. Un dia mal calculado aca significa
-- borrar justo la que habia que conservar.
--
-- ─── QUE HACE Y QUE NO ──────────────────────────────────────────────────────
--
-- Es BORRADO LOGICO: marca `deletedAt`, no destruye nada. Quedan en "Citas
-- eliminadas" y se pueden restaurar. Las notas y los cargos que cuelgan NO se
-- tocan: dejan de verse porque la cita deja de listarse, igual que con el boton.
--
-- Es IDEMPOTENTE: solo toca las que todavia no estan borradas.

-- ─── ANTES: MIRAR ───────────────────────────────────────────────────────────
-- No cambia nada. Tiene que devolver 12 filas, todas de esos dos pacientes, con
-- `se_conserva = true` en UNA sola. Si aparece otro nombre, PARAR.

SELECT a.id,
       p."firstName" || ' ' || p."lastName" AS paciente,
       to_char(a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver',
               'YYYY-MM-DD HH24:MI')        AS en_hora_de_la_clinica,
       a.status,
       ((a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date
         = (now() AT TIME ZONE 'America/Denver')::date) AS se_conserva
FROM   appointments a
JOIN   patients p ON p.id = a."patientId"
WHERE  a."patientId" IN ('cmueg5cl800062vuczc2mu0ih', 'cmuctcow900041022f6tyf17s')
  AND  a."deletedAt" IS NULL
ORDER  BY a."scheduledFor" DESC;

-- ─── EL BORRADO ─────────────────────────────────────────────────────────────
-- `RETURNING` para ver EXACTAMENTE que se toco: un UPDATE sin esto dice
-- "Success" tanto si actualizo 11 filas como si no encontro ninguna.
-- Tiene que devolver 11 filas y NINGUNA de hoy.

UPDATE appointments a
SET    "deletedAt"     = now(),
       "deletedByName" = 'Limpieza de datos de prueba',
       "deleteReason"  = 'Cita de prueba (paciente de prueba) - limpieza 2026-09-29'
FROM   patients p
WHERE  p.id = a."patientId"
  AND  a."patientId" IN ('cmueg5cl800062vuczc2mu0ih', 'cmuctcow900041022f6tyf17s')
  AND  a."deletedAt" IS NULL
  -- Se conservan las de HOY en hora de la clinica.
  AND  (a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date
         <> (now() AT TIME ZONE 'America/Denver')::date
RETURNING a.id,
          p."firstName" || ' ' || p."lastName" AS paciente,
          to_char(a."scheduledFor" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver',
                  'YYYY-MM-DD HH24:MI')        AS borrada_del_dia;

-- ─── DESPUES: COMPROBAR ─────────────────────────────────────────────────────
-- Tiene que dar vivas = 1 (la de hoy) y eliminadas = 12.

SELECT count(*) FILTER (WHERE a."deletedAt" IS NULL)     AS vivas,
       count(*) FILTER (WHERE a."deletedAt" IS NOT NULL) AS eliminadas
FROM   appointments a
WHERE  a."patientId" IN ('cmueg5cl800062vuczc2mu0ih', 'cmuctcow900041022f6tyf17s');

-- ─── LO QUE ESTE SQL NO HACE, A PROPOSITO ───────────────────────────────────
--
-- · NO archiva a los dos pacientes. Hay que dejarlos vivos justamente para
--   seguir probando con la cita de hoy.
-- · NO borra los dos casos (MVA-3415 y GM-3429). Si se borra el caso, sus citas
--   quedan colgando de un caso eliminado, que es un estado que nadie mira.
-- · NO deja rastro en el audit log: una escritura directa no pasa por la app,
--   asi que el motivo va escrito en la propia fila y es lo unico que queda.
-- · La cita de HOY que se conserva quedara sola en la agenda de ese paciente.
--   Cuando ya no haga falta, se borra corriendo esto de nuevo otro dia -- la
--   condicion es "hoy", asi que manana ya la alcanza.
