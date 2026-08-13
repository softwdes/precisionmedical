-- Cargos CPT duplicados en appointment_billing: limpieza + candado.
--
-- Encontrado el 2026-08-13 mirando por qué el saldo de una visita no cuadraba con
-- lo que mostraba la pantalla: 2 filas de 99000 y 2 de 99145 para la MISMA cita,
-- o sea $140 facturados donde la lista mostraba $70.
--
-- CAUSA: condición de carrera. `POST /appointments/:id/sync-billing` reconcilia
-- bien (lee las filas existentes, mapea por código y decide UPDATE o INSERT), pero
-- el front lo dispara DOS veces casi a la vez al agregar un cargo. Las dos
-- llamadas leen la tabla antes de que cualquiera inserte, las dos concluyen que
-- 99000 no existe, y las dos insertan. Sin índice único, nada lo impide.
--
-- Arreglar solo el doble llamado no alcanza: mañana aparece un tercer caller. El
-- candado va en la base y el `ON CONFLICT` de la ruta se apoya en él.
--
-- ⚠️ El índice es PARCIAL a propósito. Solo aplica a las filas de CPT:
--    · férulas (braceId), efectivo (cashServiceId) y labs (labOrderId) SÍ pueden
--      repetir código en la misma cita — dos aplicaciones del mismo inyectable son
--      dos cobros legítimos, y eso se decidió explícitamente el 2026-08-04.
--    · las filas agregadas viejas tienen `serviceCode` NULL.
--
-- Idempotente: se puede correr de nuevo sin efecto.

BEGIN;

-- 1) Fuera las filas de sobra, conservando UNA por (cita, código).
--    Se queda la que tiene pagos; entre iguales, la más vieja. Y solo se borra lo
--    que NO tiene pagos: una fila con plata cobrada encima no se toca ni para
--    limpiar un duplicado — eso se resuelve con un ajuste, no con un DELETE.
WITH ranked AS (
  SELECT ab.id,
         row_number() OVER (
           PARTITION BY ab."appointmentId", ab."serviceCode"
           ORDER BY (SELECT count(*) FROM billing_payments p
                      WHERE p."billingId" = ab.id AND p.status <> 'CANCELLED') DESC,
                    ab."createdAt" ASC,
                    ab.id ASC
         ) AS pos,
         (SELECT count(*) FROM billing_payments p
           WHERE p."billingId" = ab.id AND p.status <> 'CANCELLED') AS pagos
    FROM appointment_billing ab
   WHERE ab."braceId"        IS NULL
     AND ab."cashServiceId"  IS NULL
     AND ab."labOrderId"     IS NULL
     AND ab."serviceCode"    IS NOT NULL
)
DELETE FROM appointment_billing
 WHERE id IN (SELECT id FROM ranked WHERE pos > 1 AND pagos = 0);

-- 2) El candado. Si quedó algún duplicado con pagos en las dos filas, esto FALLA a
--    propósito: significa que hay plata cobrada dos veces y necesita decisión
--    humana, no un índice que la esconda.
CREATE UNIQUE INDEX IF NOT EXISTS appointment_billing_cpt_unique
    ON appointment_billing ("appointmentId", "serviceCode")
 WHERE "braceId"       IS NULL
   AND "cashServiceId" IS NULL
   AND "labOrderId"    IS NULL
   AND "serviceCode"   IS NOT NULL;

COMMIT;
