/**
 * GET /api/admin/cases/[id]/documents/[docId]/download
 *   Retorna una URL presignada de S3 para descarga directa (15 min).
 *
 * TODO: requiere AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_REGION
 *       en .env de back-office. Cuando lleguen las credenciales, reemplazar el stub.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

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

  // TODO: generate real presigned URL when S3 creds are configured
  // const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  // const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  // const s3 = new S3Client({ region: process.env.AWS_S3_REGION, credentials: { ... } });
  // const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: doc.s3Key }), { expiresIn: 900 });

  return NextResponse.json(
    { error: 'S3_NOT_CONFIGURED', message: 'Credenciales S3 pendientes de configurar.' },
    { status: 503 },
  );
}
