-- Anular una hoja de laboratorio y volver a emitirla.
--
-- La hoja sale con un número impreso y un código de barras. Corregir un error
-- —el seguro equivocado, el provider equivocado— no es editar: es ANULAR esa
-- hoja y emitir otra con un número nuevo. El viejo NO se reusa: puede estar
-- pegado en una muestra o en el mostrador del laboratorio, y dos hojas
-- distintas con el mismo número no identifican nada.
--
-- ── El índice único PARCIAL, que es el corazón de esto ─────────────────────
--
-- Hoy `groupId` es único a secas, así que un grupo no puede tener dos
-- requisiciones y no hay dónde poner la anulada. Pero quitar la unicidad sin
-- más dejaría emitir DOS hojas vigentes para el mismo grupo — justo lo que esa
-- restricción estaba cuidando.
--
-- La forma correcta es un único parcial: único entre las NO anuladas.
--
--     varias anuladas   +   una sola vigente   =   OK
--     dos vigentes                             =   la base lo rechaza
--
-- Prisma no sabe expresar índices parciales, así que en `schema.prisma` el campo
-- queda SIN `@unique` y la garantía vive acá. Está anotado en el modelo para que
-- nadie se lo "corrija" de vuelta.
--
-- Por eso además las lecturas pasan a `findFirst({ groupId, voidedAt: null })`:
-- con `findUnique` Prisma ni compilaría, que es la red que queremos.
--
-- ── La fila anulada se queda ───────────────────────────────────────────────
-- Es la constancia de que ese número existió, quién lo anuló y por qué. El PDF
-- tampoco se borra: se renombra a "(ANULADA)" en Documentos, porque el papel
-- puede estar circulando y borrar la fila escondería un hecho.
--
-- `lab_requisitions` está VACÍA hoy (0 filas), así que el índice se crea sin
-- riesgo de chocar con datos existentes.
--
-- Idempotente: `IF NOT EXISTS` en todo, y el DROP del índice viejo también.

ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "voidedAt"         TIMESTAMP(3);
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "voidedById"       TEXT;
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "voidedByName"     TEXT;
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "voidReason"       TEXT;
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "replacedByNumber" TEXT;

-- El único de siempre sale, y entra el parcial.
--
-- ⚠️ Va por CONSTRAINT y no por INDEX. `pg_indexes` lo muestra como un índice
-- —y lo es— pero está creado como UNIQUE CONSTRAINT, y Postgres no deja tirar
-- el índice que respalda una constraint:
--
--     ERROR 2BP01: cannot drop index ... because constraint ... requires it
--
-- El `DROP INDEX` de abajo queda igual, por si en otro entorno el único existe
-- suelto (sin constraint). Los dos son `IF EXISTS`, así que el que no aplica no
-- hace nada.
ALTER TABLE lab_requisitions DROP CONSTRAINT IF EXISTS "lab_requisitions_groupId_key";
DROP INDEX IF EXISTS "lab_requisitions_groupId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "lab_requisitions_groupId_vigente_key"
    ON lab_requisitions ("groupId")
 WHERE "voidedAt" IS NULL;

-- Para buscar el historial de un grupo (las anuladas incluidas).
CREATE INDEX IF NOT EXISTS "lab_requisitions_groupId_idx"
    ON lab_requisitions ("groupId");

-- ── Verificación ───────────────────────────────────────────────────────────
-- `columnas` = 5 · `parcial` = 1 · `unico_viejo` = 0 (se mira en los DOS lados:
-- la constraint y el índice, porque el error de la primera corrida fue
-- justamente confundirlos).
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'lab_requisitions'
      AND column_name IN ('voidedAt','voidedById','voidedByName','voidReason','replacedByNumber')) AS columnas,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'lab_requisitions'
      AND indexname = 'lab_requisitions_groupId_vigente_key')                                       AS parcial,
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conrelid = 'lab_requisitions'::regclass
      AND conname  = 'lab_requisitions_groupId_key')
  + (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'lab_requisitions'
      AND indexname = 'lab_requisitions_groupId_key')                                               AS unico_viejo;
