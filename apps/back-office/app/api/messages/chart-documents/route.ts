/**
 * GET /api/messages/chart-documents?patientId= — documentos del expediente
 * del paciente elegibles para "Attach From Chart" (M1 F4): archivos reales
 * (no carpetas) con key de Storage. El mensaje solo guarda la REFERENCIA
 * (patientDocumentId) — el archivo no se duplica.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const patientId = req.nextUrl.searchParams.get('patientId');
  if (!patientId) return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });

  const documents = await db.patientDocument.findMany({
    where: { patientId, isFolder: false, s3Key: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, mimeType: true, createdAt: true },
  });

  return NextResponse.json({ documents });
}
