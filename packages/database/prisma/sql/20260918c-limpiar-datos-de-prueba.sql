-- 20260918c — Limpieza de los datos de prueba
--
-- Pedido de Erick el 2026-09-18: "saben limpiemos las citas de prueba".
--
-- El equipo prueba contra la base real y cada prueba queda a la vista de todos.
-- Medido ese dia, las citas de prueba de la semana: 3 el lunes 15, 5 el 16,
-- 9 el 17 y 14 el 18. No es un charco: crece.
--
-- Ensucian DOS pantallas. La cola de Edson —casos MVA de prueba mezclados con
-- los pacientes reales que tiene que perseguir— y el calendario de la clinica,
-- donde el viernes 18 la mayoria de los bloques eran "prueba 81" y "prueba82".
--
-- ── Las 30 fichas ─────────────────────────────────────────────────────────
--
-- Salen de buscar 'prueba' o 'test' en el nombre y de MIRAR LA LISTA UNA POR
-- UNA: 'test' engancha apellidos reales —Testa, Testerman— y un DELETE por LIKE
-- contra produccion es exactamente como se pierde un paciente de verdad. Las 30
-- se revisaron y ninguna es una persona. Por eso aca se borra por CODIGO
-- EXPLICITO y no por patron.
--
-- Entre las 30 hay 10 que no tienen nada colgando, y dos que son casi todo el
-- problema: P-6184 ("81, prueba") con 20 citas y P-6185 ("prueba, prueba82")
-- con 18.
--
-- Total medido: 64 citas, 29 casos, 4 notas de visita, 32 cargos, 41 estudios
-- de laboratorio, 56 documentos, 8 liens, 10 formularios de admision y 54
-- mensajes.
--
-- ── Que se borra y que no ─────────────────────────────────────────────────
--
--  · Las CITAS si se borran, con todo lo que cuelga de ellas. Es lo unico que
--    limpia el calendario: una cita anulada se sigue viendo, tachada, y hay
--    hasta un filtro para mirarlas. Archivar no alcanza.
--
--  · Los CASOS no: se marcan `deletedAt`. Salen de la vista de Edson igual,
--    porque su consulta filtra por `deletedAt IS NULL`.
--
--  · Las FICHAS no: quedan INACTIVE, igual que la ficha vaciada al fusionar a
--    Dallas King. El codigo P-xxxx puede estar escrito en alguna prueba vieja.
--
--  · Documentos, liens, formularios de admision y message_logs QUEDAN. Cuelgan
--    del caso o del paciente, no de la cita, y como esos dos sobreviven no hay
--    nada que forzar. Ojo para el futuro: los liens y los formularios estan
--    declarados `onDelete: RESTRICT`, asi que el dia que se decida borrar los
--    casos hay que sacarlos a mano primero.
--
-- ── El orden no es decorativo ─────────────────────────────────────────────
--
-- `visit_notes`, `lab_orders` y `prescriptions` NO son cascade: cuelgan de la
-- cita con RESTRICT, asi que borrar la cita primero se frena contra ellas.
--
-- Y los cargos van ANTES que los labs, porque un cargo apunta al estudio que lo
-- genero (`appointment_billing.labOrderId`).
--
-- Las que si son cascade se borran igual una por una, a proposito: el schema de
-- esta base se aplico con `db push` y tiene deriva conocida, asi que no me fio
-- de que el CASCADE del schema sea el CASCADE que hay en la base.
--
-- ── Como correrlo ─────────────────────────────────────────────────────────
--
--   cd packages/database
--   node scripts/apply-sql.cjs prisma/sql/20260918c-limpiar-datos-de-prueba.sql
--
-- Va todo en UNA transaccion: si algo choca contra una FK que no previmos, no
-- entra nada y el error dice contra que. Y es repetible: la segunda corrida no
-- encuentra citas, los UPDATE filtran por estado y el audit log va con
-- ON CONFLICT DO NOTHING.

BEGIN;

-- 1 · Los codigos CPT de las notas. Cuelgan de la nota, no de la cita.
DELETE FROM visit_service_codes
 WHERE "visitNoteId" IN (
   SELECT v."id" FROM visit_notes v
    WHERE v."appointmentId" IN (
      SELECT a."id" FROM appointments a
        JOIN patients p ON p."id" = a."patientId"
       WHERE p."patientCode" IN (
         'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
         'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
         'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
       )
    )
 );

-- 2 · Las notas de visita. Son RESTRICT: sin esto, el borrado de la cita se
--     frena contra ellas.
DELETE FROM visit_notes
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 3 · Los pagos de un cargo. Cuelgan del cargo, no de la cita.
DELETE FROM billing_payments
 WHERE "billingId" IN (
   SELECT b."id" FROM appointment_billing b
    WHERE b."appointmentId" IN (
      SELECT a."id" FROM appointments a
        JOIN patients p ON p."id" = a."patientId"
       WHERE p."patientCode" IN (
         'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
         'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
         'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
       )
    )
 );

-- 4 · Los cargos. VAN ANTES que los labs: un cargo apunta al estudio que lo
--     genero, asi que al reves el borrado del lab choca contra el cargo.
DELETE FROM appointment_billing
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 5 · Los estudios de laboratorio. Tambien RESTRICT.
DELETE FROM lab_orders
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 6 · Las recetas. Tambien RESTRICT. Hoy son 0, pero si alguien prueba una
--     receta antes de que esto corra, aca queda cubierto.
DELETE FROM prescriptions
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 7 · El triaje, las ferulas y los servicios de la visita.
DELETE FROM triage_records
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

DELETE FROM appointment_braces
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

DELETE FROM appointment_services
 WHERE "appointmentId" IN (
   SELECT a."id" FROM appointments a
     JOIN patients p ON p."id" = a."patientId"
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 8 · Y ahora si, las citas. Esto es lo que limpia el calendario.
DELETE FROM appointments
 WHERE "patientId" IN (
   SELECT p."id" FROM patients p
    WHERE p."patientCode" IN (
      'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
      'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
      'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
    )
 );

-- 9 · Los casos se marcan borrados, no se eliminan.
UPDATE cases
   SET "deletedAt" = now() AT TIME ZONE 'UTC'
 WHERE "deletedAt" IS NULL
   AND "patientId" IN (
     SELECT p."id" FROM patients p
      WHERE p."patientCode" IN (
        'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
        'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
        'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
      )
   );

-- 10 · Las fichas quedan INACTIVE.
UPDATE patients
   SET "status" = 'INACTIVE'
 WHERE "status" <> 'INACTIVE'
   AND "patientCode" IN (
     'P-2411','P-2453','P-2792','P-2879','P-4359','P-4418','P-4419','P-4520','P-5347','P-5378',
     'P-5477','P-5479','P-5481','P-5585','P-5591','P-5592','P-5835','P-5848','P-5851','P-5966',
     'P-6103','P-6149','P-6150','P-6152','P-6184','P-6185','P-6191','P-6199','P-6200','P-6204'
   );

-- 11 · Constancia. Sin esto, dentro de seis meses nadie puede contestar "que
--      paso con las 64 citas de prueba de septiembre".
INSERT INTO audit_logs (id, "actorType", action, "entityType", "entityId", metadata, "createdAt")
VALUES (
  'purge-test-20260918',
  'SYSTEM',
  'PURGE_TEST_DATA',
  'patients',
  NULL,
  jsonb_build_object(
    'motivo',    'Limpieza de datos de prueba pedida por Erick el 2026-09-18: ensuciaban la cola de Edson y el calendario de toda la clinica.',
    'fichas',    30,
    'codigos',   'P-2411 P-2453 P-2792 P-2879 P-4359 P-4418 P-4419 P-4520 P-5347 P-5378 P-5477 P-5479 P-5481 P-5585 P-5591 P-5592 P-5835 P-5848 P-5851 P-5966 P-6103 P-6149 P-6150 P-6152 P-6184 P-6185 P-6191 P-6199 P-6200 P-6204',
    'medido',    jsonb_build_object('appointments', 64, 'cases', 29, 'visit_notes', 4, 'appointment_billing', 32, 'lab_orders', 41),
    'noBorrado', 'casos marcados deletedAt y fichas a INACTIVE; documentos, liens, formularios de admision y message_logs quedan intactos'
  ),
  now() AT TIME ZONE 'UTC'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verificacion ──────────────────────────────────────────────────────────
--
-- Para PEGAR EN SUPABASE despues: apply-sql.cjs solo imprime "OK".
-- Esperado: 0 citas, 0 casos vivos, 30 fichas INACTIVE, y el calendario de la
-- semana sin una sola cita de prueba (hoy: 3 · 5 · 9 · 14).
--
--   SELECT (SELECT COUNT(*) FROM appointments a
--             JOIN patients p ON p."id" = a."patientId"
--            WHERE p."firstName" ILIKE '%prueba%' OR p."lastName" ILIKE '%prueba%'
--               OR p."firstName" ILIKE '%test%'   OR p."lastName" ILIKE '%test%') AS citas_que_quedan,
--          (SELECT COUNT(*) FROM cases c
--             JOIN patients p ON p."id" = c."patientId"
--            WHERE c."deletedAt" IS NULL
--              AND (p."firstName" ILIKE '%prueba%' OR p."lastName" ILIKE '%prueba%'
--                OR p."firstName" ILIKE '%test%'   OR p."lastName" ILIKE '%test%')) AS casos_vivos,
--          (SELECT COUNT(*) FROM patients
--            WHERE "status" = 'INACTIVE'
--              AND ("firstName" ILIKE '%prueba%' OR "lastName" ILIKE '%prueba%'
--                OR "firstName" ILIKE '%test%'   OR "lastName" ILIKE '%test%')) AS fichas_inactivas;
