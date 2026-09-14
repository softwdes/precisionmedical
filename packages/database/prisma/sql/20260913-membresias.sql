-- Membresías de la clínica — la foto semanal del sistema externo.
--
-- La clínica vende membresías en un sistema aparte. Hasta que haya integración
-- en vivo, cada semana llega un CSV y esta tabla es donde aterriza. Recepción
-- necesita saber, en el momento de agendar, si el paciente tiene membresía y
-- hasta cuándo — hoy esa pregunta se contesta abriendo otro sistema.
--
-- ── Por qué no hay columna de "activa" ──────────────────────────────────────
-- Porque el origen no la manda. Lo único que viene es `proximo_pago`, así que
-- el estado se DEDUCE comparándolo contra hoy. Guardar un booleano calculado
-- sería peor: al día siguiente estaría mintiendo y nadie lo recalcularía.
--
-- En el primer corte (22 contratos) ya hay 2 vencidos hace ~6 semanas, así que
-- esto no es un caso hipotético.
--
-- ── Por qué `corteAl` es obligatorio ────────────────────────────────────────
-- El dato tiene hasta 7 días de atraso. Una pantalla que muestre "Activa" sin
-- decir de cuándo es el dato invita a leerlo como si fuera de hoy. La fecha del
-- corte viaja con cada fila para que la pastilla pueda mostrarla.
--
-- ── Texto y no enums ────────────────────────────────────────────────────────
-- `plan` y `tipo` son valores de un sistema ajeno (hoy: Basic; INDIVIDUAL,
-- FAMILIAR, EMPRESA). Con un enum, el día que ellos agreguen un plan hay que
-- migrar la base para poder importar una fila. No vale la pena.
--
-- ── Fechas sin hora ─────────────────────────────────────────────────────────
-- `DATE` y no `TIMESTAMP`: son días de calendario. Con timestamp, un
-- vencimiento del día 1 se renderiza el 31 del mes anterior en horario de
-- Denver — la misma trampa que la fecha de nacimiento.
--
-- Idempotente: `IF NOT EXISTS` en todo. Se aplica con
--   node packages/database/scripts/apply-sql.cjs packages/database/prisma/sql/20260913-membresias.sql

CREATE TABLE IF NOT EXISTS patient_memberships (
    id                TEXT           PRIMARY KEY,
    "patientId"       TEXT           NOT NULL,

    -- Llave natural del origen. El importador hace upsert por acá: reimportar
    -- el mismo corte no duplica nada.
    "contratoExterno" TEXT           NOT NULL,

    -- El id del paciente EN EL ORIGEN (que es el id del v2). Se guarda aunque
    -- ya esté resuelto a "patientId" porque es lo único que permite auditar un
    -- cruce dudoso más adelante.
    "pacienteExterno" TEXT           NOT NULL,

    plan              TEXT           NOT NULL,
    tipo              TEXT           NOT NULL,
    "montoMensual"    DECIMAL(10, 2) NOT NULL,

    empresa           TEXT,
    "grupoFamiliar"   TEXT,

    "fechaInicio"     DATE,
    "ultimoPago"      DATE,
    "proximoPago"     DATE,

    origen            TEXT           NOT NULL DEFAULT 'CSV',
    "corteAl"         TIMESTAMP(3)   NOT NULL,

    -- Si un corte deja de traer un contrato se apaga, NO se borra: un archivo
    -- incompleto no puede hacer desaparecer la membresía de alguien que paga.
    "enUltimoCorte"   BOOLEAN        NOT NULL DEFAULT true,

    "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "patient_memberships_contratoExterno_key"
    ON patient_memberships ("contratoExterno");

CREATE INDEX IF NOT EXISTS "patient_memberships_patientId_idx"
    ON patient_memberships ("patientId");

-- El listado ordena por vencimiento y la pastilla filtra por él.
CREATE INDEX IF NOT EXISTS "patient_memberships_proximoPago_idx"
    ON patient_memberships ("proximoPago");

-- El nombre del constraint es el que espera Prisma (`<tabla>_<campo>_fkey`),
-- para que un `migrate diff` futuro no lo vea como deriva y lo dropee.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'patient_memberships_patientId_fkey'
    ) THEN
        ALTER TABLE patient_memberships
            ADD CONSTRAINT "patient_memberships_patientId_fkey"
            FOREIGN KEY ("patientId") REFERENCES patients (id)
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
