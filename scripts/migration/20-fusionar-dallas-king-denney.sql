-- ════════════════════════════════════════════════════════════════════════════
-- Fusión de fichas · Dallas Denney (P-5049) ← Dallas King (P-6025)
--
-- Son la misma persona. Cambió de apellido y quedó una ficha nueva en vez de
-- actualizarse la que ya existía:
--
--   P-5049  Dallas Denney  dallasleann@hotmail.com   102 e. Selman Ridge Dr.
--   P-6025  Dallas King    DALLASLEANN@HOTMAIL.COM   102 E SELMAN RIDGE DRIVE Salem
--
-- Mismo correo (sólo cambia el uso de mayúsculas — por eso el índice único no
-- lo frenó), misma dirección, misma fecha de nacimiento (1983-09-16).
--
-- ── Qué lo destapó ─────────────────────────────────────────────────────────
-- La clínica reportó que la cita del viernes 18 salía marcada como "1st visit"
-- siendo un paciente de años. No era un error del calendario: el historial vive
-- bajo DENNEY y la cita se agendó bajo KING, que no tenía ninguna anterior.
--
-- ── Cuál sobrevive, y por qué al revés de lo que parece ────────────────────
-- Se conserva **P-5049 (Denney)** aunque el apellido correcto sea King, porque
-- ahí está la historia: 6 citas, 2 casos y 36 documentos desde noviembre de
-- 2025. Mover eso a la ficha nueva sería mover lo mucho hacia lo poco.
--
-- El apellido se corrige en la ficha que se queda: termina siendo P-5049 con el
-- nombre actual, "Dallas King", y todo el historial junto.
--
-- De P-6025 se mueven 1 cita, 1 caso (MVA-3162) y 33 documentos. No tiene
-- llamadas, mensajes, membresías, comisiones, ni es contacto ni apoderado de
-- nadie — verificado tabla por tabla antes de escribir esto.
--
-- ── La ficha vacía NO se borra ─────────────────────────────────────────────
-- Queda en INACTIVE y sin correo. Borrarla perdería el código P-6025, que puede
-- estar escrito en papeles, en el v2 o en un correo a la aseguradora. Y el
-- correo se le saca para que la próxima búsqueda por "dallasleann@hotmail.com"
-- devuelva UNA sola ficha: dejárselo reproduciría exactamente el problema que
-- este script viene a arreglar.
--
--   cd packages/database && node scripts/apply-sql.cjs ../../scripts/migration/20-fusionar-dallas-king-denney.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Los ids van literales y no por subconsulta a propósito: si alguien corrige un
-- apellido antes de correr esto, una subconsulta por nombre elegiría otra ficha
-- en silencio. Estos dos ids se leyeron de la base el 2026-09-14.
--   P-6025 Dallas King   → cmtyu4xtcdxht8qer17   (se vacía)
--   P-5049 Dallas Denney → cmtytrrdbq67qw80g43   (se queda)

-- ─── Cinturón: que las dos sigan siendo las que creo que son ────────────────
-- Si alguien ya las fusionó a mano, o los ids cambiaron, esto aborta y no toca
-- nada. Más vale fallar que fusionar dos pacientes distintos.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM patients
   WHERE (id = 'cmtyu4xtcdxht8qer17' AND "patientCode" = 'P-6025')
      OR (id = 'cmtytrrdbq67qw80g43' AND "patientCode" = 'P-5049');
  IF n <> 2 THEN
    RAISE EXCEPTION 'ABORTADO: esperaba las fichas P-6025 y P-5049 con esos ids, encontré %. Revisar a mano.', n;
  END IF;
END $$;

-- ─── 1. Mover lo que cuelga de King a Denney ────────────────────────────────
UPDATE appointments        SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE cases               SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE patient_documents   SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';

-- Estas cuatro dan 0 filas hoy. Van igual, porque este script es el modelo para
-- los otros 76 pares de fichas duplicadas y ahí sí van a tener contenido.
UPDATE call_logs           SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE message_logs        SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE message_threads     SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE patient_memberships SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';
UPDATE commissions         SET "patientId" = 'cmtytrrdbq67qw80g43' WHERE "patientId" = 'cmtyu4xtcdxht8qer17';

-- Y si alguien la tenía como dueña de contacto o como apoderada.
UPDATE patients SET "contactOwnerId"    = 'cmtytrrdbq67qw80g43' WHERE "contactOwnerId"    = 'cmtyu4xtcdxht8qer17';
UPDATE patients SET "guardianPatientId" = 'cmtytrrdbq67qw80g43' WHERE "guardianPatientId" = 'cmtyu4xtcdxht8qer17';

-- ─── 2. La ficha que se queda toma el apellido actual ───────────────────────
UPDATE patients
   SET "lastName"  = 'King',
       "updatedAt" = now() AT TIME ZONE 'UTC'
 WHERE id = 'cmtytrrdbq67qw80g43';

-- ─── 3. La ficha vacía se apaga y suelta el correo ──────────────────────────
-- El apellido queda con el puntero a dónde fue: quien la encuentre en un listado
-- viejo sabe adónde ir sin tener que preguntar.
UPDATE patients
   SET status      = 'INACTIVE',
       email       = NULL,
       "lastName"  = 'King (ficha fusionada -> P-5049)',
       "updatedAt" = now() AT TIME ZONE 'UTC'
 WHERE id = 'cmtyu4xtcdxht8qer17';

-- ─── 4. Que quede en el historial ───────────────────────────────────────────
-- Una fusión mueve la historia clínica de una persona de una ficha a otra. Sin
-- constancia, dentro de seis meses nadie puede responder por qué las citas de
-- 2026 aparecen bajo un apellido que en su momento no era el de la paciente.
INSERT INTO audit_logs (id, "actorType", action, "entityType", "entityId", metadata, "createdAt")
VALUES (
  'merge-dallas-20260914',
  'SYSTEM',
  'MERGE_PATIENT',
  'patients',
  'cmtytrrdbq67qw80g43',
  jsonb_build_object(
    'motivo',       'Misma persona con apellido nuevo: mismo correo, misma direccion, misma fecha de nacimiento.',
    'origen',       jsonb_build_object('patientCode','P-6025','id','cmtyu4xtcdxht8qer17','apellido','King'),
    'destino',      jsonb_build_object('patientCode','P-5049','id','cmtytrrdbq67qw80g43','apellido','Denney -> King'),
    'movido',       jsonb_build_object('appointments',1,'cases',1,'patient_documents',33),
    'reportadoPor', 'la clinica, por la cita del 2026-09-18 marcada como 1st visit'
  ),
  now() AT TIME ZONE 'UTC'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Esperado: P-5049 "Dallas King" con 7 citas, 3 casos y 69 documentos;
-- P-6025 en INACTIVE, sin correo y sin nada colgando.
--
-- SELECT p."patientCode", p."firstName", p."lastName", p.email, p.status::text,
--        (SELECT COUNT(*) FROM appointments a WHERE a."patientId" = p.id) AS citas,
--        (SELECT COUNT(*) FROM cases c        WHERE c."patientId" = p.id) AS casos,
--        (SELECT COUNT(*) FROM patient_documents d WHERE d."patientId" = p.id) AS docs
--   FROM patients p WHERE p."patientCode" IN ('P-5049','P-6025');
