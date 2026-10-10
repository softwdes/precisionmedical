-- ────────────────────────────────────────────────────────────────────────────
-- Crédito a favor en la compañía de cobranza — la marca del paciente
--
-- El espejo de `collectBeforeVisit` con el signo invertido: aquélla dice
-- *cobrale antes de atenderlo*, ésta dice **no le cobres el copago**.
--
-- Viene de Darrell (cobranza), 2026-10-09, describiendo lo que ya hace hoy en
-- Medusa: *"We note in the patient's alert that the patient has a credit
-- balance not to collect copays."*
--
-- La plata NO la tiene la clínica: está retenida a nombre del paciente en PHI,
-- el software de CBO, y se aplica entre dos semanas y dos meses después. Por eso
-- esta marca **no toca ningún saldo** — el copago se sigue debiendo de verdad
-- hasta que CBO aplique el crédito. Lo único que agrega es el PORQUÉ, que hoy
-- no existe en ningún lado: un copago esperando un crédito se ve idéntico a uno
-- que nadie cobró.
--
-- Va en el PACIENTE y no en el cargo porque el crédito es de la persona, no de
-- la visita, y porque acá llega a tiempo: sale en el saludo de CIFO cuando el
-- paciente llega, antes de que el mostrador le pida la plata.
--
-- Cuatro columnas, todas nuevas y todas aditivas. No toca ni una fila existente:
-- el `DEFAULT false` deja a los 5.726 pacientes exactamente como estaban.
--
-- Idempotente: se puede correr de nuevo sin efecto.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "patients"
    ADD COLUMN IF NOT EXISTS "creditOnFile"     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "creditOnFileNote" TEXT,
    ADD COLUMN IF NOT EXISTS "creditOnFileBy"   TEXT,
    ADD COLUMN IF NOT EXISTS "creditOnFileAt"   TIMESTAMP(3);

COMMIT;
