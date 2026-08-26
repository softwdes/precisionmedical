/**
 * GET  /api/attorney/messages/[threadId] — leer un hilo (y marcarlo leído).
 * POST /api/attorney/messages/[threadId] — responder.
 *
 * La llave de acceso es la MISMA en los dos verbos: existir como destinatario
 * del hilo. No hace falta preguntar por el caso ni por el bufete — si a alguien
 * no le escribieron, para él ese hilo no existe. Un id adivinado devuelve 404,
 * no un 403: decir "existe pero no podés verlo" ya es contar algo.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

const ReplySchema = z.object({ body: z.string().min(1).max(4000) });

/** ¿Esta persona participa del hilo? Devuelve su fila de destinatario. */
async function participacion(threadId: string, userId: string) {
  return db.messageRecipient.findFirst({
    where: {
      threadId,
      userId,
      deletedAt: null,
      thread: { deletedAt: null, removedFromInboxesAt: null },
    },
    select: { threadId: true },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
  const { threadId } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });

  if (!(await participacion(threadId, actor.actorUserId))) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    select: {
      id: true, subject: true, priority: true,
      case: { select: { id: true, caseCode: true } },
      entries: {
        orderBy: { sentAt: 'asc' },
        select: { id: true, authorName: true, body: true, sentAt: true, kind: true },
      },
    },
  });
  if (!thread) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Abrirlo es leerlo. Se sella acá y no en el cliente: un "marcar leído" que
  // depende de que el navegador avise se pierde en cuanto alguien cierra la
  // pestaña a mitad de camino.
  await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({
    id: thread.id,
    subject: thread.subject,
    priority: thread.priority,
    caseCode: thread.case?.caseCode ?? null,
    caseId: thread.case?.id ?? null,
    entries: thread.entries,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
  const { threadId } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId || !actor.actorName) {
    return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });
  }

  if (!(await participacion(threadId, actor.actorUserId))) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  let input: z.infer<typeof ReplySchema>;
  try {
    input = ReplySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'RESPUESTA_INVALIDA' }, { status: 400 });
  }

  const now = new Date();

  /**
   * La respuesta y el sello del hilo van juntos.
   *
   * Sin la transacción, un `lastEntryAt` viejo deja el mensaje enterrado al
   * fondo de la bandeja de quien tiene que leerlo: existe pero nadie lo ve.
   */
  await db.$transaction([
    db.messageEntry.create({
      data: {
        threadId,
        kind: 'MESSAGE',
        authorUserId: actor.actorUserId,
        authorName: actor.actorName,
        body: input.body.trim(),
        sentAt: now,
      },
    }),
    db.messageThread.update({ where: { id: threadId }, data: { lastEntryAt: now } }),
    // Quien responde ya leyó lo suyo; los demás vuelven a "no leído" porque
    // `lastReadAt` queda por detrás del nuevo `lastEntryAt`.
    db.messageRecipient.updateMany({
      where: { threadId, userId: actor.actorUserId },
      data: { lastReadAt: now },
    }),
  ]);

  writeAuditLog(db, {
    ...actor,
    action: 'MESSAGE_REPLIED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { comoBufete: lawyer.firmName ?? lawyer.id },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
