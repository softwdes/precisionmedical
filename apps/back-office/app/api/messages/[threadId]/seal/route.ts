/**
 * POST /api/messages/[threadId]/seal → Move to Patient Folder (±nota final).
 *
 * Sella el hilo: todo lo previo queda inmutable (visual, nada de editar ni
 * borrar entradas selladas) y el hilo sale de TODOS los inboxes. La nota
 * opcional se inserta ANTES del sello, así queda sellada con el resto.
 *
 * No cambia lastEntryAt cuando va sin nota — sellar no re-embolda a nadie.
 * Entradas posteriores sí reviven el hilo (ver entries/route.ts).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;

  const raw = (await req.json().catch(() => ({}))) as { note?: string };
  const note = raw?.note?.trim();

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, subject: true, sealedAt: true },
  });
  if (!thread) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });
  if (thread.sealedAt) {
    return NextResponse.json({ error: 'El hilo ya está sellado' }, { status: 409 });
  }

  const now = new Date();
  await db.$transaction([
    ...(note
      ? [
          db.messageEntry.create({
            data: {
              threadId,
              kind: 'SEAL_NOTE',
              authorUserId: actor.actorUserId,
              authorName: actor.actorName,
              body: note,
              sentAt: now,
            },
          }),
        ]
      : []),
    db.messageThread.update({
      where: { id: threadId },
      data: {
        sealedAt: now,
        sealedByUserId: actor.actorUserId,
        sealedByName: actor.actorName,
        removedFromInboxesAt: now,
        ...(note ? { lastEntryAt: now } : {}),
      },
    }),
  ]);

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_THREAD_SEALED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { subject: thread.subject, withNote: Boolean(note), sealedByName: actor.actorName },
  }).catch(() => undefined);

  return NextResponse.json({ sealedAt: now });
}
