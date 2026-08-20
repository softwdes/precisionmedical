/**
 * GET /api/admin/cases/[id]/documents/[docId]/download
 *   Retorna una URL presignada de Supabase Storage para descarga directa (15 min).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createClient } from '@supabase/supabase-js';

// Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy.
const supabase = createClient(
  (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!,
);

const BUCKET = 'case-documents';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: { id: true, caseId: true, s3Key: true, isFolder: true, name: true },
  });

  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (doc.isFolder) {
    return NextResponse.json({ error: 'IS_FOLDER' }, { status: 400 });
  }
  if (!doc.s3Key) {
    return NextResponse.json({ error: 'NO_S3_KEY' }, { status: 400 });
  }

  // Dos firmas del MISMO archivo, misma expiración: una para VER embebido en el
  // modal y otra para DESCARGAR. La de descarga lleva `download`, que hace que
  // Storage responda con `Content-Disposition: attachment`. Sin eso el botón de
  // descargar NAVEGA la pestaña al archivo, porque el atributo `download` del
  // `<a>` se ignora cuando la URL es de otro origen (la firmada es de
  // supabase.co, no del dominio de la app).
  const [view, dl] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900),
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900, { download: doc.name }),
  ]);
  const { data, error } = view;

  if (error || !data || dl.error || !dl.data) {
    console.error('[download] Supabase Storage error:', error ?? dl.error);
    return NextResponse.json({ error: 'STORAGE_ERROR', message: (error ?? dl.error)?.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, downloadUrl: dl.data.signedUrl, name: doc.name });
}
