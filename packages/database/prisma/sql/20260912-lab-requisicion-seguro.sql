-- El seguro con el que se emitió cada hoja de laboratorio.
--
-- Hasta ahora la hoja usaba SIEMPRE el seguro del caso, y en silencio: nadie
-- veía cuál hasta que el papel estaba impreso. Erick (2026-09-12): el paciente
-- puede querer pagar la orden con otro seguro, o con una membresía de otra
-- clínica que funciona como seguro, y el encargado se lo pregunta en el momento.
--
-- ── Por qué acá y no en el caso ────────────────────────────────────────────
-- `cases.primaryInsuranceId` es el seguro DEL ACCIDENTE y lo leen el HCFA, el
-- libro mayor, el settlement y facturación (12 rutas). Cambiarlo desde una
-- pantalla clínica movería plata en módulos que nadie está mirando en ese
-- momento. Esto es "quién paga ESTA orden" y no sale del laboratorio.
--
-- Es un SNAPSHOT, igual que `providerName`/`providerNpi` que ya están en esta
-- tabla: la hoja salió impresa con estos datos y el código de barras los lleva
-- adentro. Si mañana cambia el seguro del caso, el papel no cambia.
--
-- ── Por qué TEXT y no una FK a insurance_carriers ──────────────────────────
-- LabCorp no valida contra ningún catálogo: en la carga `MEDUSAP2.1` el seguro
-- son tres strings (nombre, dirección, póliza). Y una membresía de otra clínica
-- no es una aseguradora — obligar a elegir del catálogo llenaría de fichas
-- inventadas uno que ya tiene 220 de 351 marcadas como "OTHER".
--
-- ── Sin backfill ───────────────────────────────────────────────────────────
-- `lab_requisitions` está VACÍA (0 filas, medido hoy): la función subió ayer y
-- todavía no se emitió ninguna hoja. No hay nada que rellenar ni papel impreso
-- con el que reconciliar.
--
-- Idempotente por `IF NOT EXISTS`.

ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "insuranceName"    TEXT;
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "insurancePolicy"  TEXT;
ALTER TABLE lab_requisitions ADD COLUMN IF NOT EXISTS "insuranceAddress" TEXT;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Tiene que devolver las 3 filas, todas `text` y `YES`.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'lab_requisitions'
   AND column_name IN ('insuranceName', 'insurancePolicy', 'insuranceAddress')
 ORDER BY column_name;
