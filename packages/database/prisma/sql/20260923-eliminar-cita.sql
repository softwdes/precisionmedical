-- 20260923 — Eliminar una cita: borrado LÓGICO, con papelera y restauración
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
--
-- Erick, 2026-09-23: *"en el calendario no tenemos la opción de eliminar una
-- cita: solo cancelar, reagendar. Han estado haciendo pruebas y a veces se
-- equivocan y deben eliminarla."*
--
-- Hoy la única forma de sacar de la vista una cita cargada por error es
-- CANCELARLA, y eso miente: cancelar significa *el paciente no viene*, es un
-- hecho clínico y de facturación que puede llevar penalidad y que alimenta las
-- estadísticas. Una cita de prueba cancelada ensucia justamente el número que
-- la clínica usa para cobrar.
--
-- ── Por qué lógico y no un DELETE ───────────────────────────────────────────
--
-- Mismo criterio que los documentos (ver 2026-09-13): la fila se marca, no se
-- va. Así se puede auditar quién borró qué, y devolverla si se equivocaron.
-- Erick: *"no hay problema que lo eliminen todos, igual no se perderá y se
-- podrá ver"*.
--
-- ── Lo que NO se puede eliminar ─────────────────────────────────────────────
--
-- La regla no vive acá sino en `lib/citas-vigentes.ts`, pero conviene que quede
-- escrito junto a la columna: una cita con RASTRO no se elimina, se cancela.
-- Rastro es tener cargos, nota de visita, check-in, firma de asistencia, o
-- estar atendida / no-show / cancelada el mismo día.
--
-- Sin esa traba, eliminar se vuelve el atajo cómodo para deshacer un no-show y
-- la clínica pierde el historial con el que cobra las penalidades.
--
-- ── Ojo al leer citas ───────────────────────────────────────────────────────
--
-- Hay ~45 consultas que listan citas en 36 archivos de CUATRO apps. Todas
-- filtran con `VIGENTES` de `lib/citas-vigentes.ts`. Olvidarse de una no falla:
-- muestra de más. Con un grep de `VIGENTES` se ven las que lo respetan y las
-- que no.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS "deletedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "deletedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "deleteReason"  TEXT;

-- El calendario pide un rango de fechas Y no-eliminadas en la misma consulta,
-- que es la lectura más caliente del sistema.
CREATE INDEX IF NOT EXISTS appointments_scheduled_deleted_idx
  ON appointments ("scheduledFor", "deletedAt");

-- La papelera lista por fecha de borrado, descendente.
CREATE INDEX IF NOT EXISTS appointments_deleted_at_idx
  ON appointments ("deletedAt")
  WHERE "deletedAt" IS NOT NULL;

COMMENT ON COLUMN appointments."deletedAt" IS
  'Borrado LOGICO. Con valor, la cita no existe para ninguna pantalla salvo la papelera; su horario vuelve a estar libre. Se restaura desde "Citas eliminadas" en el calendario. Ver prisma/sql/20260923-eliminar-cita.sql';

COMMENT ON COLUMN appointments."deleteReason" IS
  'Por que se elimino: prueba, duplicada, paciente equivocado, u otro texto. Sin esto la papelera es una lista de filas que en un mes nadie sabe interpretar.';
