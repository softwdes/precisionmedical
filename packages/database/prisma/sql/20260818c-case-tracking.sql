-- 20260818c — Cuaderno de Edson (paso 4 de la vista de tracking)
--
-- `case_tracking`       → completado / archivado del caso
-- `case_tracking_notes` → observaciones con fecha y autor
--
-- Completado y archivado son actos distintos: completado pinta la fila de verde
-- pero no la saca de la cola; archivar la manda al segundo tab.
--
-- Ver docs/plan-vista-edson.md §3.3 y §3.4

CREATE TABLE IF NOT EXISTS "case_tracking" (
  "id"              TEXT PRIMARY KEY,
  "caseId"          TEXT NOT NULL,

  "completedAt"     TIMESTAMP(3),
  "completedById"   TEXT,
  "completedByName" TEXT,

  "archivedAt"      TIMESTAMP(3),
  "archivedById"    TEXT,
  "archivedByName"  TEXT,

  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_tracking_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "case_tracking_caseId_key"      ON "case_tracking" ("caseId");
CREATE INDEX        IF NOT EXISTS "case_tracking_completed_idx"   ON "case_tracking" ("completedAt");
CREATE INDEX        IF NOT EXISTS "case_tracking_archived_idx"    ON "case_tracking" ("archivedAt");

CREATE TABLE IF NOT EXISTS "case_tracking_notes" (
  "id"           TEXT PRIMARY KEY,
  "caseId"       TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "authorUserId" TEXT,
  "authorName"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_tracking_notes_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- El orden de lectura es siempre "las notas de este caso, más nueva primero".
CREATE INDEX IF NOT EXISTS "case_tracking_notes_case_created_idx"
  ON "case_tracking_notes" ("caseId", "createdAt");
