/**
 * Salidas del inbox — las dos variantes de "Delete" del legacy. Ninguna toca
 * el historial del paciente (eso es DELETE /api/messages/[threadId], admin).
 *
 * DELETE /api/messages/[threadId]/inbox      → mi Delete personal: el hilo
 *        sale de MI bandeja (recipient.deletedAt), nadie más se entera.
 * DELETE /api/messages/[threadId]/inbox?all=1 → Delete From All: sale de
 *        todas las bandejas (thread.removedFromInboxesAt). Auditado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;
  const all = req.nextUrl.searchParams.get('all') === '1';

  if (all) {
    const updated = await db.messageThread.updateMany({
      where: { id: threadId, deletedAt: null },
      data: { removedFromInboxesAt: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });
    }
    writeAuditLog(db, {
      ...(await resolveActor(req.headers)),
      action: 'MESSAGE_THREAD_REMOVED_FROM_ALL_INBOXES',
      entityType: 'MessageThread',
      entityId: threadId,
      metadata: { byName: actor.actorName },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
