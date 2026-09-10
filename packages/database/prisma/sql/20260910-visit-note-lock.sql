-- Candado de la nota clínica: el que la abre primero la edita, el resto la ve.
--
-- Decisión de Erick (2026-09-10). Hasta ahora el turno se decidía por un HECHO
-- del negocio —la consulta abierta y sin cerrar, ver el docblock del PUT en
-- api/admin/visit-notes/[appointmentId]—, así que con el doctor FUERA de consulta
-- dos asistentes en Day Admission, o Day Admission y la cola de /doctor/notes,
-- podían escribir a la vez sin que nadie viera un aviso.
--
-- El candado se sostiene con un LATIDO, no con un flag: sin fecha de latido, una
-- iPad que se duerme o una pestaña olvidada dejan la nota trabada para siempre
-- con el paciente esperando en el mostrador. Con el latido, el candado vence solo
-- y nadie necesita un botón para arrebatarle la nota a otro usuario.
--
-- Los nombres van DENORMALIZADOS (no solo el id) por el mismo criterio que
-- `case_managers.assignedByName`: la pantalla muestra "Juan está editando" sin
-- pegarle un join a `users` en cada latido, que ocurre cada 20 segundos por
-- cada nota abierta.

-- ── Quién la tiene ───────────────────────────────────────────────────────────
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "editingByUserId" TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "editingByName"   TEXT;
-- Desde cuándo la tiene. Es lo que se le muestra al que espera ("desde 14:20"),
-- distinto del latido: uno es para la persona, el otro para el vencimiento.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "editingSince"     TIMESTAMP(3);
-- Último latido. El candado vale solo mientras esta fecha sea reciente.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "editingHeartbeatAt" TIMESTAMP(3);
-- Última tecla. Separada del latido a propósito: el latido dice "la pestaña está
-- viva", esta dice "la persona está TRABAJANDO". La liberación por inactividad
-- (10 min, decisión de Erick) mira esta, porque una pestaña abierta en otra
-- ventana late igual mientras su dueño almuerza.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "editingTypedAt"   TIMESTAMP(3);

-- ── Quién está esperando ─────────────────────────────────────────────────────
-- Lo escribe el botón "Avisarle" del segundo usuario. El que tiene la nota lo
-- recibe en la RESPUESTA de su propio latido, así que el aviso le aparece dentro
-- de la nota que está escribiendo sin ningún canal nuevo.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "waitingByUserId" TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "waitingByName"   TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS "waitingSince"    TIMESTAMP(3);

-- Barrido de los candados vencidos: se busca por la fecha de latido, no por el
-- id de la nota.
CREATE INDEX IF NOT EXISTS "visit_notes_editing_heartbeat_idx"
  ON visit_notes ("editingHeartbeatAt");
