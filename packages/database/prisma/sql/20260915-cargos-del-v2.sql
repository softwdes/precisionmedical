-- Marca de origen en los cargos: cuáles vinieron del v2.
--
-- ── Por qué hace falta ──────────────────────────────────────────────────────
--
-- Finanzas del caso muestra SOLO lo que paga el paciente en el mostrador, y un
-- cargo cuenta como "del paciente" únicamente si nació de una férula, un
-- servicio de mostrador o un laboratorio (regla de Erick, 10-ago-2026: una
-- línea que paga el seguro nunca puede sumar al total del mostrador, porque el
-- asistente termina pidiéndosela al paciente).
--
-- Los 6.455 cargos que trajimos del v2 no tienen ninguna de esas tres marcas,
-- así que caen del lado del seguro y la pantalla los esconde. Resultado: un
-- caso con $26.945 de saldo real se ve en $0.00 — que es lo que reportó Erick
-- el 15-sep mirando a Carrie Luckau (MVA-1351).
--
-- La decisión fue NO reclasificarlos como cobrables: en los casos MVA paga el
-- abogado, y marcar $862.000 como "del paciente" pondría a recepción
-- pidiéndole esa plata a gente que no la debe. En vez de eso, el historial del
-- v2 se muestra aparte, de solo lectura, con sus pagos — y esta columna es lo
-- que permite separarlo sin adivinar.
--
-- ── Por qué una columna y no una heurística ─────────────────────────────────
--
-- "Los que no tienen férula, servicio ni lab" también describe a un CPT creado
-- hoy por `sync-billing`. Y "los creados antes de tal fecha" deja de ser cierto
-- en cuanto alguien corrija una fila. La marca explícita es la única que sigue
-- siendo verdad en seis meses, cuando nadie se acuerde de esta migración.
--
-- Se rellena con `scripts/migration/12b-marcar-cargos-del-v2.mjs`, que la pone
-- solo en los ids que están en `id-maps/billing.json` — el registro de qué fila
-- del v2 se convirtió en qué fila de v3. Nada de patrones.
--
-- Idempotente. Todas las filas existentes quedan en `false`, que es lo correcto
-- para cualquier cargo nacido en v3.

ALTER TABLE appointment_billing
    ADD COLUMN IF NOT EXISTS "migratedFromV2" BOOLEAN NOT NULL DEFAULT false;

-- La pantalla del caso pide "los del v2 de ESTE caso", así que el índice va
-- sobre el par. `appointment_billing` tiene 6.462 filas y crece con cada visita.
CREATE INDEX IF NOT EXISTS "appointment_billing_caseId_migratedFromV2_idx"
    ON appointment_billing ("caseId", "migratedFromV2");
