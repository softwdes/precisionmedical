-- Borrado lógico de documentos y carpetas.
--
-- Hasta hoy eliminar un documento corría `DELETE` sobre `patient_documents` y
-- la fila desaparecía. El archivo del bucket, en cambio, NO se borraba: el
-- endpoint nunca lo tocó. El resultado era lo peor de los dos mundos — el PDF
-- seguía ocupando espacio para siempre y **nadie podía recuperarlo**, porque el
-- nombre, el paciente, el caso y la carpeta se iban con la fila.
--
-- Decisión de Erick (2026-09-13): que el borrado sea lógico y haya papelera en
-- la misma pantalla, para que el que se equivocó lo resuelva en el momento.
--
-- ── Qué NO cambia ──────────────────────────────────────────────────────────
-- Una carpeta con contenido sigue sin poder eliminarse: hay que vaciarla
-- primero. Aunque ahora sea recuperable, mandar 17 archivos a la papelera con
-- un clic es mucho poder para un botón chico (misma decisión, mismo día).
--
-- ── El índice ──────────────────────────────────────────────────────────────
-- Las listas filtran por caso Y por no-borrado en la misma consulta, así que el
-- índice va sobre el par. `patient_documents` tiene 16.884 filas y crece con
-- cada visita.
--
-- Idempotente por `IF NOT EXISTS`. Todas las filas existentes quedan con
-- `deletedAt` en NULL, o sea vigentes — que es lo correcto: nada estaba borrado.

ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS "deletedAt"     TIMESTAMP(3);
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS "deletedById"   TEXT;
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS "deletedByName" TEXT;

CREATE INDEX IF NOT EXISTS "patient_documents_caseId_deletedAt_idx"
    ON patient_documents ("caseId", "deletedAt");

-- ── Verificación ───────────────────────────────────────────────────────────
-- `columnas` = 3 · `indice` = 1 · `vigentes` = el total de la tabla (nada
-- quedó marcado como borrado por accidente).
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'patient_documents'
      AND column_name IN ('deletedAt','deletedById','deletedByName'))        AS columnas,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'patient_documents'
      AND indexname = 'patient_documents_caseId_deletedAt_idx')              AS indice,
  (SELECT COUNT(*) FROM patient_documents WHERE "deletedAt" IS NULL)         AS vigentes,
  (SELECT COUNT(*) FROM patient_documents)                                   AS total;
