/**
 * GET  /api/attorney/messages/[threadId] — leer un hilo (y marcarlo leído).
 * POST /api/attorney/messages/[threadId] — responder.
 *
 * La llave de acceso es la MISMA en los dos verbos: existir como destinatario
 * del hilo. No hace falta preguntar por el caso ni por el bufete — si a alguien
 * no le escribieron, para él ese hilo no existe. Un id adivinado devuelve 404,
 * no un 403: decir "existe pero no podés verlo" ya es contar algo.
 *
 * Lo que el abogado VE del hilo son los mensajes (MESSAGE · REPLY · FORWARD).
 * Las notas (NOTE · SEAL_NOTE) son anotaciones internas de la clínica sobre el
 * hilo y no viajan al portal — antes salían todas y una nota de cobranza para
 * uso interno le llegaba al bufete.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

const ReplySchema = z.object({ body: z.string().min(1).max(4000) });

/** Lo que el portal muestra del hilo: mensajes, no anotaciones internas. */
const KINDS_VISIBLES = ['MESSAGE', 'REPLY', 'FORWARD'] as const;

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

  const mia = await db.messageRecipient.findFirst({
    where: { threadId, userId: actor.actorUserId, deletedAt: null, thread: { deletedAt: null, removedFromInboxesAt: null } },
    select: { archivedAt: true },
  });
  if (!mia) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    select: {
      id: true, subject: true, priority: true, desk: true, topic: true, type: true, createdAt: true, createdByUserId: true,
      referral: { select: { status: true, convertedByName: true, convertedAt: true } },
      case: { select: { id: true, caseCode: true } },
      // El paciente está en el alcance del abogado —es SU cliente—, así que el
      // nombre puede ir en la cabecera igual que en su lista de casos.
      patient: { select: { firstName: true, lastName: true } },
      recipients: {
        where: { kind: { in: ['TO', 'CC'] } },
        select: { userName: true, kind: true },
      },
      entries: {
        where: { kind: { in: [...KINDS_VISIBLES] } },
        orderBy: { sentAt: 'asc' },
        select: {
          id: true, authorUserId: true, authorName: true, body: true, sentAt: true, kind: true,
          attachments: { select: { id: true, fileName: true, documentType: true } },
        },
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
    desk: thread.desk,
    topic: thread.topic,
    type: thread.type,
    referral: thread.referral
      ? { status: thread.referral.status, convertedByName: thread.referral.convertedByName, convertedAt: thread.referral.convertedAt }
      : null,
    createdAt: thread.createdAt,
    archived: !!mia.archivedAt,
    mine: thread.createdByUserId === actor.actorUserId,
    caseCode: thread.case?.caseCode ?? null,
    caseId: thread.case?.id ?? null,
    patientName: thread.patient ? `${thread.patient.firstName} ${thread.patient.lastName}`.trim() : null,
    recipients: thread.recipients,
    entries: thread.entries.map((e) => ({
      ...e,
      // Para pintar "vos" vs "la clínica" sin mandar ids ajenos al cliente.
      mine: e.authorUserId === actor.actorUserId,
      authorUserId: undefined,
    })),
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
   * Y la respuesta REVIVE el hilo en las bandejas de la clínica igual que
   * cualquier entrada: si alguien lo había borrado de la suya, vuelve.
   */
  await db.$transaction([
    db.messageEntry.create({
      data: {
        threadId,
        kind: 'REPLY',
        authorUserId: actor.actorUserId,
        authorName: actor.actorName,
        body: input.body.trim(),
        sentAt: now,
      },
    }),
    db.messageThread.update({ where: { id: threadId }, data: { lastEntryAt: now, removedFromInboxesAt: null } }),
    db.messageRecipient.updateMany({
      where: { threadId, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
    // Y lo archivado vuelve a la bandeja de todos: hay algo nuevo que leer.
    db.messageRecipient.updateMany({
      where: { threadId, archivedAt: { not: null } },
      data: { archivedAt: null },
    }),
    // Quien responde ya leyó lo suyo; los demás vuelven a "no leído" porque
    // `lastReadAt` queda por detrás del nuevo `lastEntryAt`.
    db.messageRecipient.updateMany({
      where: { threadId, userId: actor.actorUserId },
      data: { lastReadAt: now },
    }),
  ]);

  await writeAuditLog(db, {
    ...actor,
    action: 'MESSAGE_REPLIED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { comoBufete: lawyer.firmName ?? lawyer.id },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true });
}
