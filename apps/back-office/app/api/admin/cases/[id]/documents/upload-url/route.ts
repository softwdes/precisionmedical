/**
 * POST /api/admin/cases/[id]/documents/upload-url
 *   Genera una URL presignada de S3 para subida directa desde el browser.
 *   body: { name: string, mimeType: string, size: number, parentId?: string }
 *   returns: { uploadUrl: string, s3Key: string }
 *
 * Flujo:
 *   1. Front llama este endpoint → obtiene uploadUrl + s3Key
 *   2. Front hace PUT directo a S3 con el archivo
 *   3. Front llama POST /documents con { name, s3Key, mimeType, size, parentId }
 *
 * TODO: requiere AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_REGION
 *       en .env de back-office. Cuando lleguen las credenciales, reemplazar el stub.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';

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

  // TODO: generate real presigned PUT URL when S3 creds are configured
  // const s3Key = `cases/${caseId}/${Date.now()}-${parsed.name.replace(/[^a-z0-9._-]/gi, '_')}`;
  // const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  // const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  // const s3 = new S3Client({ region: process.env.AWS_S3_REGION, credentials: { ... } });
  // const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key, ContentType: parsed.mimeType }), { expiresIn: 300 });
  // return NextResponse.json({ uploadUrl, s3Key });

  return NextResponse.json(
    { error: 'S3_NOT_CONFIGURED', message: 'Credenciales S3 pendientes de configurar.' },
    { status: 503 },
  );
}
