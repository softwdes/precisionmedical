-- Agrega el estado N/A al PIP del caso (columna PIP del tracking de Edson).
--
-- Hasta hoy el PIP solo podía ser YES / NO / UNKNOWN, y UNKNOWN significa
-- "nadie llamó todavía": es la cola de trabajo de Edson y el número del tile
-- "PIP sin confirmar". No había forma de decir "a este caso el PIP no le
-- aplica", así que esos casos se quedaban en la cola para siempre.
--
-- NOT_APPLICABLE es un estado RESPONDIDO: sale de la cola, igual que YES y NO.
--
-- ORDEN: esto va PRIMERO. El código que escribe el valor no puede salir antes
-- de que el tipo lo acepte.
--
-- `IF NOT EXISTS` lo hace idempotente: correrlo dos veces no rompe nada.
-- Va suelto, sin BEGIN/COMMIT: Postgres no deja usar un valor de enum en la
-- misma transacción en que se lo agrega.

ALTER TYPE "PipAvailability" ADD VALUE IF NOT EXISTS 'NOT_APPLICABLE';

-- Verificación: tienen que salir los 4.
SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS estados_de_pip
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'PipAvailability';
