/**
 * GET /api/admin/cases/[id]/documents/[docId]/download
 *   Retorna una URL presignada de Supabase Storage para descarga directa (15 min).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.s3Key, 900);

  if (error || !data) {
    console.error('[download] Supabase Storage error:', error);
    return NextResponse.json({ error: 'STORAGE_ERROR', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, name: doc.name });
}
