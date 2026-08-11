/**
 * PATCH /api/messages/[threadId]/entries/[entryId] — corregir un mensaje ya
 * enviado.
 *
 * Solo el AUTOR, y solo mientras NINGÚN otro participante lo haya leído. La
 * condición es la lectura y no un reloj: si alguien ya lo leyó pudo haber
 * actuado sobre él, y cambiarle el texto por detrás es reescribir un registro
 * clínico a espaldas de quien actuó. En ese caso la vía correcta es responder
 * con la corrección, que deja los dos hechos en orden.
 *
 * `lastReadAt` es por hilo, así que la comparación va contra `sentAt` de ESTA
 * entrada: alguien que leyó los mensajes anteriores pero no llegó a este todavía
 * no vio nada que se le pueda cambiar.
 *
 * Si es la PRIMERA entrada del hilo, se puede corregir también el asunto — es
 * donde vive conceptualmente, como en un correo.
 *
 * Lo sellado nunca se edita (`sentAt <= sealedAt`).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string; entryId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId, entryId } = await ctx.params;

  const raw = (await req.json().catch(() => null)) as { body?: string; subject?: string } | null;
  const body = raw?.body?.trim();
  if (!body) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });

  const entry = await db.messageEntry.findFirst({
    where: { id: entryId, threadId },
    select: {
      id: true, authorUserId: true, sentAt: true, body: true,
      thread: {
        select: {
          id: true, subject: true, sealedAt: true, deletedAt: true, createdByUserId: true,
          recipients: { select: { userId: true, userName: true, lastReadAt: true } },
          entries: { orderBy: { sentAt: 'asc' }, take: 1, select: { id: true } },
        },
      },
    },
  });

  if (!entry || entry.thread.deletedAt) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (entry.authorUserId !== actor.actorUserId) {
    return NextResponse.json({ error: 'SOLO_AUTOR' }, { status: 403 });
  }
  if (entry.thread.sealedAt && entry.sentAt <= entry.thread.sealedAt) {
    return NextResponse.json({ error: 'SELLADO' }, { status: 409 });
  }

  // ¿Alguien más ya lo leyó?
  const lector = entry.thread.recipients.find(
    (r) => r.userId !== actor.actorUserId && r.lastReadAt !== null && r.lastReadAt >= entry.sentAt,
  );
  if (lector) {
    return NextResponse.json(
      { error: 'YA_LEIDO', readerName: lector.userName },
      { status: 409 },
    );
  }

  const isFirst = entry.thread.entries[0]?.id === entry.id;
  const newSubject = raw?.subject?.trim();
  const cambiaAsunto =
    isFirst && !!newSubject && newSubject !== entry.thread.subject &&
    entry.thread.createdByUserId === actor.actorUserId;

  const now = new Date();
  await db.$transaction([
    db.messageEntry.update({
      where: { id: entry.id },
      data: { body, editedAt: now },
    }),
    ...(cambiaAsunto
      ? [db.messageThread.update({
          where: { id: threadId },
          data: { subject: newSubject!.slice(0, 200) },
        })]
      : []),
  ]);

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_ENTRY_EDITED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: {
      entryId: entry.id,
      // El texto anterior es la razón de ser de este registro: aunque la
      // edición sea segura (nadie lo leyó), el rastro no cuesta nada.
      previousBody: entry.body.slice(0, 2000),
      previousSubject: cambiaAsunto ? entry.thread.subject : undefined,
      editedByName: actor.actorName,
    },
  }).catch(() => undefined);

  return NextResponse.json({ editedAt: now, subject: cambiaAsunto ? newSubject : entry.thread.subject });
}
