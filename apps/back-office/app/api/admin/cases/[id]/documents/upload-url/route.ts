/**
 * POST /api/admin/cases/[id]/documents/upload-url
 *   Genera una URL presignada de Supabase Storage para subida directa desde el browser.
 *   body: { name: string, mimeType: string, size: number, parentId?: string }
 *   returns: { uploadUrl: string, s3Key: string }
 *
 * Flujo:
 *   1. Front llama este endpoint → obtiene uploadUrl + s3Key
 *   2. Front hace PUT directo a Supabase Storage con el archivo
 *   3. Front llama POST /documents con { name, s3Key, mimeType, size, parentId }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'case-documents';

const Schema = z.object({
  name:     z.string().trim().min(1).max(255),
  mimeType: z.string().default('application/octet-stream'),
  size:     z.number().int().positive(),
  parentId: z.string().nullable().default(null),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = Schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const safeName = parsed.name.replace(/[^a-z0-9._\-\s]/gi, '_');
  const s3Key = `cases/${caseId}/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(s3Key);

  if (error || !data) {
    console.error('[upload-url] Supabase Storage error:', error);
    return NextResponse.json({ error: 'STORAGE_ERROR', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl: data.signedUrl, s3Key });
}
