/**
 * GET /api/attorney/cases/[id]/documents/[docId]/download
 *
 * Espejo del `download` administrativo, con el alcance del bufete adelante. Las
 * dos firmas —ver y descargar— y el porqué de que sean dos están explicados en
 * `app/api/admin/cases/[id]/documents/[docId]/download/route.ts`.
 *
 * No hay borrado ni subida en el portal legal: ver el docblock de `../../route.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createClient } from '@supabase/supabase-js';
import { casoDelAbogado } from '@/lib/attorney-case-scope';

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
  const { id, docId } = await ctx.params;
  const { caseId, deny } = await casoDelAbogado(id);
  if (deny) return deny;

  const doc = await db.patientDocument.findUnique({
    where:  { id: docId },
    select: { id: true, caseId: true, s3Key: true, isFolder: true, name: true },
  });

  // `doc.caseId !== caseId` es la parte que importa: sin esto, un abogado con un
  // caso propio podría pedir el documento de cualquier otro pasando su docId.
  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (doc.isFolder)  return NextResponse.json({ error: 'IS_FOLDER' },  { status: 400 });
  if (!doc.s3Key)    return NextResponse.json({ error: 'NO_S3_KEY' },  { status: 400 });

  const [view, dl] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900),
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900, { download: doc.name }),
  ]);

  if (view.error || !view.data || dl.error || !dl.data) {
    console.error('[attorney/download] Supabase Storage error:', view.error ?? dl.error);
    return NextResponse.json(
      { error: 'STORAGE_ERROR', message: (view.error ?? dl.error)?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: view.data.signedUrl, downloadUrl: dl.data.signedUrl, name: doc.name });
}
