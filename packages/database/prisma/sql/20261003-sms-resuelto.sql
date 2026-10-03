-- 20261003 — "este mensaje no necesita respuesta"
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- La pestaña *Por responder* se limpia sola: contestás y la conversación sale.
-- Eso funciona para una pregunta. No funciona para un "Ok".
--
-- Medido el 2026-10-03 sobre el buzón real: de 11 entrantes, 7 tienen 15
-- caracteres o menos y 2 son acuses puros. De las 3 conversaciones que estaban
-- esperando respuesta, dos eran "Yes" y "Ok". O sea que el mensaje que no
-- necesita respuesta no es el caso raro, es la mayoría del tráfico.
--
-- Hoy la única forma de sacar un "Ok" de ahí es contestarle "ok" al paciente:
-- un SMS pagado para apagar un indicador. Pedido de Erick (2026-10-03).
--
-- ── Por qué la marca va en el MENSAJE y no en la conversación ───────────────
--
-- Lo natural sería una tabla de conversaciones con su `resolvedAt`. No sirve, y
-- el motivo es una trampa que ya nos cruzamos: **la clave de conversación es
-- derivada y MUTABLE**. Una conversación sin paciente se identifica por
-- `tel:8016381400`, y en cuanto alguien elige a cuál de los 2 pacientes que
-- comparten ese número pertenece (el PUT de `conversaciones`), pasa a ser
-- `pac:<id>`. Una fila de estado colgada de `tel:…` quedaría huérfana en ese
-- mismo instante, y el descarte se perdería sin un solo error.
--
-- En el mensaje no hay nada que se rompa: la marca viaja con la fila, sobrevive
-- a la reasignación, y reusa el patrón que ya existe al lado — `readAt` /
-- `readByUserId`, agregados en 20260928b por el mismo razonamiento.
--
-- ── La propiedad que lo vuelve seguro ───────────────────────────────────────
--
-- Un mensaje NUEVO del paciente nace con `resolvedAt` NULL. Por eso la
-- conversación vuelve sola a *Por responder* en cuanto el paciente escribe de
-- nuevo, sin que haya que acordarse de deshacer nada.
--
-- Eso es lo que hace que descartar sea barato: cierra LO DICHO HASTA ACÁ, no la
-- conversación. Lo peor que puede pasar con un descarte equivocado es que algo
-- se vea tarde; nunca que se pierda. Sin esta propiedad el botón sería un lugar
-- donde esconder un "Cancel my appointment for tomorrow".
--
-- ── Por qué NO se reusa `readAt` ────────────────────────────────────────────
--
-- Tentador: ya hay una fecha por mensaje. Pero son dos hechos distintos y hoy
-- se contradicen. `readAt` se escribe solo con abrir el mensaje —no afirma que
-- alguien se haya ocupado— y justamente por eso el badge NO lo usa: el 2026-10-01
-- había 6 sin leer y 3 esperando respuesta. Mezclarlos haría que mirar la lista
-- vacíe la pestaña, que es el bug que la definición actual evita a propósito.
--
-- `resolvedAt` es una decisión explícita de una persona, con nombre.
--
-- ── El índice ───────────────────────────────────────────────────────────────
--
-- El contador del badge pasa a preguntar por el último entrante SIN resolver,
-- así que filtra por `direction` y `resolvedAt` juntos, igual que el de `readAt`.
-- Se consulta en cada navegación.
--
-- No hace falta GRANT: `message_logs` ya existe y ya los tiene. Los GRANT se
-- pierden al CREAR una tabla a mano, no al agregarle columnas.
--
-- Aplicar con: node scripts/apply-sql.cjs packages/database/prisma/sql/20261003-sms-resuelto.sql

BEGIN;

ALTER TABLE message_logs
  ADD COLUMN IF NOT EXISTS "resolvedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedByName"   TEXT;

COMMENT ON COLUMN message_logs."resolvedAt" IS
  'Alguien decidio que este mensaje ENTRANTE no necesita respuesta. NULL = sigue abierto. Distinto de readAt: leer no es ocuparse. En un saliente no significa nada.';

COMMENT ON COLUMN message_logs."resolvedByName" IS
  'Quien lo marco, para poder mostrarlo en el hilo sin un join. El id queda al lado para responder "quien" con certeza.';

CREATE INDEX IF NOT EXISTS "message_logs_direction_resolvedAt_idx"
  ON message_logs (direction, "resolvedAt");

COMMIT;
