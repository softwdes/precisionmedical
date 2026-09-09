/**
 * GET /api/messages/attachments/[id] → URL firmada (15 min) para abrir el
 * adjunto. El bucket es privado; la firma es la única vía de lectura.
 * Auditado como los resultados de laboratorio (quién abrió qué).
 *
 * La firma en sí vive en `lib/messaging-attachments.ts`, compartida con la
 * puerta del portal legal; acá solo queda quién puede (cualquier interno).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';
import { firmarAdjunto } from '@/lib/messaging-attachments';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { id } = await ctx.params;

  const firmado = await firmarAdjunto(id);
  if (!firmado.ok) return NextResponse.json({ error: firmado.error }, { status: firmado.status });

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'VIEW_MESSAGE_ATTACHMENT',
    entityType: 'MessageThread',
    entityId: firmado.threadId,
    metadata: { attachmentId: firmado.attachmentId, fileName: firmado.name },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({
    url: firmado.url,
    downloadUrl: firmado.downloadUrl,
    name: firmado.name,
  });
}
