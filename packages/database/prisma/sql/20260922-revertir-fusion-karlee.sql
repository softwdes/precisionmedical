-- 20260922 — Deshacer la fusion de los dos casos de Karlee Sanchez
--
-- El 17 de septiembre `20260917-fusionar-casos-mva-duplicados.sql` absorbio
-- MVA-3311 dentro de MVA-1830 tratandolos como el mismo accidente. NO LO SON:
--
--   MVA-1830  accidente 2025-09-12  creado 2025-11-04  (el viejo)
--   MVA-3311  accidente 2026-08-01  creado 2026-08-31  (el nuevo)
--
-- Once meses de diferencia. La clinica lo reporto: "her September 1st
-- appointment appears as regular, follow up MVA, which is incorrect, that day
-- was her new MVA". Tenia razon.
--
-- ── Por que paso ──────────────────────────────────────────────────────────
--
-- La guarda del script comparaba `COALESCE(cai."lossDate", c."accidentDate")`.
-- Mira PRIMERO el lossDate de la fila de seguro, y solo cae a `accidentDate` si
-- el primero esta vacio. Los dos casos tenian el mismo lossDate y el mismo
-- numero de claim, porque se copian al abrir un caso nuevo. Asi que la guarda
-- comparo los campos arrastrados, los vio iguales, y nunca llego a mirar
-- `cases.accidentDate` — que es el que la persona llena de verdad.
--
-- La guarda confiaba en el campo que se COPIA en vez del que se ESCRIBE. Ese es
-- el error, y no se vuelve a proponer una fusion hasta reescribirla.
--
-- ── Que se devuelve ───────────────────────────────────────────────────────
--
--  · MVA-3311 vuelve a estar vivo (se le quita `deletedAt`).
--  · Su cita del 1 de septiembre vuelve a colgar de el. Reagin creo el caso a
--    las 20:30 del 31 de agosto y la cita a las 20:31 — un minuto despues. Por
--    eso el criterio "creada despues que el caso" identifica la cita correcta,
--    y la guarda de abajo se planta si no encuentra exactamente una.
--  · La facturacion NO hay que moverla: su fila quedo apuntando a MVA-3311
--    cuando la cita se fue, asi que al volver la cita las dos coinciden solas.
--    El paso 3 igual verifica y alinea, por si algo quedo al reves.
--  · La fila de seguro tampoco: MVA-3311 conservo la suya, porque el script
--    solo la movia si el sobreviviente no tenia una y MVA-1830 ya tenia.
--
-- ── Que NO se puede devolver, y hay que decirlo ───────────────────────────
--
-- El script de fusion movio 14 tablas y solo guardo los TOTALES, no que fila
-- salio de donde. De los 21 documentos y del lien que hoy cuelgan de MVA-1830
-- no hay forma de saber cuales eran de MVA-3311. Quedan donde estan: son del
-- mismo paciente, no se pierde nada, pero el expediente nuevo arranca sin ellos
-- y alguien va a tener que mirarlo a ojo.
--
-- ── Como correrlo ─────────────────────────────────────────────────────────
--
--   cd packages/database
--   node scripts/apply-sql.cjs prisma/sql/20260922-revertir-fusion-karlee.sql
--
-- Va en una transaccion con dos guardas que abortan todo si el estado no es el
-- esperado. Correrlo dos veces no hace nada: la segunda vez la segunda guarda
-- ve el caso ya vivo y se planta.

BEGIN;

-- ── Guarda 1: el caso tiene que estar borrado por la fusion ────────────────
DO $$
DECLARE d timestamp;
BEGIN
  SELECT "deletedAt" INTO d FROM cases WHERE "caseCode" = 'MVA-3311';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe MVA-3311. No se toca nada.';
  END IF;
  IF d IS NULL THEN
    RAISE EXCEPTION 'MVA-3311 ya esta vivo: esto ya se revirtio. No se toca nada.';
  END IF;
END $$;

-- ── Guarda 2: tiene que haber EXACTAMENTE una cita para devolver ───────────
-- Si hay 0, la fusion no movio nada y no hay nada que deshacer. Si hay 2 o mas,
-- el criterio no alcanza para decidir y esto lo tiene que mirar una persona.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
    FROM appointments a
    JOIN cases viejo ON viejo."id" = a."caseId" AND viejo."caseCode" = 'MVA-1830'
    JOIN cases nuevo ON nuevo."caseCode" = 'MVA-3311'
   WHERE a."createdAt" >= nuevo."createdAt";
  IF n <> 1 THEN
    RAISE EXCEPTION 'Esperaba 1 cita para devolver y encontre %. No se toca nada.', n;
  END IF;
END $$;

-- ── 1 · El caso vuelve a estar vivo ────────────────────────────────────────
UPDATE cases
   SET "deletedAt" = NULL
 WHERE "caseCode" = 'MVA-3311'
   AND "deletedAt" IS NOT NULL;

-- ── 2 · La cita del 1 de septiembre vuelve a su caso ───────────────────────
UPDATE appointments a
   SET "caseId" = nuevo."id"
  FROM cases nuevo, cases viejo
 WHERE nuevo."caseCode" = 'MVA-3311'
   AND viejo."caseCode" = 'MVA-1830'
   AND a."caseId" = viejo."id"
   AND a."createdAt" >= nuevo."createdAt";

-- ── 3 · La facturacion sigue a su cita ─────────────────────────────────────
-- Acotado a este paciente a proposito: los otros 6 cargos desalineados son de
-- las nueve fusiones que todavia no se revisaron, y alinearlos ahora seria dar
-- por buena una fusion que puede estar mal.
UPDATE appointment_billing b
   SET "caseId" = a."caseId"
  FROM appointments a
 WHERE a."id" = b."appointmentId"
   AND b."caseId" IS DISTINCT FROM a."caseId"
   AND a."patientId" = (SELECT "patientId" FROM cases WHERE "caseCode" = 'MVA-3311');

-- ── 4 · Constancia ─────────────────────────────────────────────────────────
INSERT INTO audit_logs (id, "actorType", action, "entityType", "entityId", before, after, metadata, "createdAt")
SELECT 'revert-merge-karlee-20260922',
       'SYSTEM',
       'REVERT_MERGE_DUPLICATE_CASE',
       'Case',
       c."id",
       jsonb_build_object('caseCode', 'MVA-3311', 'mergedInto', 'MVA-1830'),
       jsonb_build_object('caseCode', 'MVA-3311', 'deletedAt', NULL),
       jsonb_build_object(
         'motivo',   'La fusion del 2026-09-17 los trato como el mismo accidente y no lo son: 2025-09-12 contra 2026-08-01.',
         'causa',    'La guarda comparaba COALESCE(cai.lossDate, cases.accidentDate) y los dos casos compartian lossDate y claim por copia al abrir el caso nuevo.',
         'reportado','la clinica, por la cita del 2026-09-01 marcada como seguimiento siendo un MVA nuevo',
         'devuelto', jsonb_build_object('cases', 1, 'appointments', 1),
         'noDevuelto','documentos y lien: el script de fusion no guardo que fila salio de donde',
         'archivo',  '20260922-revertir-fusion-karlee.sql')
       , now() AT TIME ZONE 'UTC'
  FROM cases c WHERE c."caseCode" = 'MVA-3311'
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verificacion ──────────────────────────────────────────────────────────
--
-- Para PEGAR EN SUPABASE despues. Esperado:
--   MVA-1830 vivo, 5 citas   ·   MVA-3311 vivo, 1 cita (la del 1-sep)
--   cargos desalineados del paciente: 0
--
--   SELECT c."caseCode",
--          COALESCE(to_char(c."deletedAt",'YYYY-MM-DD'),'vivo')                      AS borrado,
--          COALESCE(to_char(c."accidentDate",'YYYY-MM-DD'),'—')                      AS accidente,
--          (SELECT COUNT(*) FROM appointments a WHERE a."caseId" = c."id")::int      AS citas,
--          (SELECT COUNT(*) FROM appointment_billing b
--             JOIN appointments a2 ON a2."id" = b."appointmentId"
--            WHERE a2."caseId" = c."id" AND b."caseId" IS DISTINCT FROM a2."caseId")::int AS cargos_desalineados
--     FROM cases c
--    WHERE c."caseCode" IN ('MVA-1830','MVA-3311')
--    ORDER BY 1;
