/**
 * GET /api/messages/attachments/[id] → URL firmada (15 min) para abrir el
 * adjunto. El bucket es privado; la firma es la única vía de lectura.
 * Auditado como los resultados de laboratorio (quién abrió qué).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';

const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
/** Subidas nuevas del compose */
const BUCKET = 'message-attachments';
/** Documentos del expediente ("Attach From Chart" guarda la referencia) */
const CHART_BUCKET = 'case-documents';

const storage = createClient(SUPABASE_URL, SERVICE_KEY);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { id } = await ctx.params;

  const att = await db.messageAttachment.findUnique({
    where: { id },
    select: {
      id: true, fileUrl: true, fileName: true, patientDocumentId: true,
      entry: { select: { threadId: true } },
    },
  });
  if (!att || (!att.fileUrl && !att.patientDocumentId)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
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
    if (!doc?.s3Key) return NextResponse.json({ error: 'SOURCE_DOCUMENT_GONE' }, { status: 410 });
    bucket = CHART_BUCKET;
    key = doc.s3Key;
  }

  // Dos firmas del MISMO archivo, misma expiración: una para VER embebido y
  // otra para DESCARGAR.
  //
  // La de descarga lleva `download`, que hace que Storage responda con
  // `Content-Disposition: attachment`. Sin eso el navegador NAVEGA la pestaña
  // al PDF: el atributo `download` del `<a>` se ignora cuando la URL es de otro
  // origen —y la firmada es de supabase.co, no del dominio de la app—, así que
  // el usuario perdía el hilo donde estaba y la URL firmada quedaba en el
  // historial del navegador. Con el header el archivo baja sin navegar a
  // ninguna parte: el modal no se cierra y no queda rastro en el historial.
  const [view, dl] = await Promise.all([
    storage.storage.from(bucket).createSignedUrl(key!, 900),
    storage.storage.from(bucket).createSignedUrl(key!, 900, { download: att.fileName }),
  ]);
  const { data, error } = view;
  if (error || !data || dl.error || !dl.data) {
    console.error('[message-attachment] signed url error:', error ?? dl.error);
    return NextResponse.json({ error: 'STORAGE_ERROR' }, { status: 500 });
  }

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'VIEW_MESSAGE_ATTACHMENT',
    entityType: 'MessageThread',
    entityId: att.entry.threadId,
    metadata: { attachmentId: att.id, fileName: att.fileName },
  }).catch(() => undefined);

  return NextResponse.json({
    url: data.signedUrl,
    downloadUrl: dl.data.signedUrl,
    name: att.fileName,
  });
}
