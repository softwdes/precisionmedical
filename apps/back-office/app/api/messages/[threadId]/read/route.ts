/**
 * POST /api/messages/[threadId]/read → marca MI lastReadAt (quita el bold).
 *
 * Solo escribe la fila del propio actor: mirar el inbox de otro usuario nunca
 * le marca nada como leído (decisión de Erick 2026-08-07). Si el actor no es
 * destinatario (ej. el autor abriendo su propio hilo), es un no-op silencioso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;

  await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
