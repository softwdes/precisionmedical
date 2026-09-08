/**
 * Adjuntos de mensajería · la URL firmada, compartida por las dos puertas.
 *
 * La clínica abre los adjuntos por `/api/messages/attachments/[id]` y el
 * abogado por `/api/attorney/messages/attachments/[id]`. Las dos rutas deciden
 * distinto QUIÉN puede (cualquier interno / solo un destinatario del hilo) pero
 * firman igual, así que la firma vive acá una sola vez. Los route files no
 * admiten exports extra, de ahí el archivo aparte.
 */

import { createClient } from '@supabase/supabase-js';
import { db } from '@precision-medical/database';

const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
/** Subidas nuevas del compose */
const BUCKET = 'message-attachments';
/** Documentos del expediente ("Attach From Chart" guarda la referencia) */
const CHART_BUCKET = 'case-documents';

const storage = createClient(SUPABASE_URL, SERVICE_KEY);

export type AdjuntoFirmado =
  | { ok: true; url: string; downloadUrl: string; name: string; threadId: string; attachmentId: string }
  | { ok: false; status: 404 | 410 | 500; error: 'NOT_FOUND' | 'SOURCE_DOCUMENT_GONE' | 'STORAGE_ERROR'; threadId: string | null };

/**
 * Dos firmas del MISMO archivo, misma expiración (15 min): una para VER
 * embebido y otra para DESCARGAR.
 *
 * La de descarga lleva `download`, que hace que Storage responda con
 * `Content-Disposition: attachment`. Sin eso el navegador NAVEGA la pestaña al
 * PDF: el atributo `download` del `<a>` se ignora cuando la URL es de otro
 * origen —y la firmada es de supabase.co, no del dominio de la app—, así que el
 * usuario perdía el hilo donde estaba y la URL firmada quedaba en el historial.
 */
export async function firmarAdjunto(id: string): Promise<AdjuntoFirmado> {
  const att = await db.messageAttachment.findUnique({
    where: { id },
    select: {
      id: true, fileUrl: true, fileName: true, patientDocumentId: true,
      entry: { select: { threadId: true } },
    },
  });
  if (!att || (!att.fileUrl && !att.patientDocumentId)) {
    return { ok: false, status: 404, error: 'NOT_FOUND', threadId: att?.entry.threadId ?? null };
  }

  // Adjunto del expediente: resolver la key del documento referenciado. Si el
  // documento se borró después, el adjunto queda como evidencia sin archivo.
  let bucket = BUCKET;
  let key = att.fileUrl;
  if (!key && att.patientDocumentId) {
    const doc = await db.patientDocument.findUnique({
      where: { id: att.patientDocumentId },
      select: { s3Key: true },
    });
    if (!doc?.s3Key) return { ok: false, status: 410, error: 'SOURCE_DOCUMENT_GONE', threadId: att.entry.threadId };
    bucket = CHART_BUCKET;
    key = doc.s3Key;
  }

  const [view, dl] = await Promise.all([
    storage.storage.from(bucket).createSignedUrl(key!, 900),
    storage.storage.from(bucket).createSignedUrl(key!, 900, { download: att.fileName }),
  ]);
  if (view.error || !view.data || dl.error || !dl.data) {
    console.error('[message-attachment] signed url error:', view.error ?? dl.error);
    return { ok: false, status: 500, error: 'STORAGE_ERROR', threadId: att.entry.threadId };
  }

  return {
    ok: true,
    url: view.data.signedUrl,
    downloadUrl: dl.data.signedUrl,
    name: att.fileName,
    threadId: att.entry.threadId,
    attachmentId: att.id,
  };
}
