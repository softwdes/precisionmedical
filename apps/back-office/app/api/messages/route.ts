/**
 * Mensajería interna (M1)
 *
 * GET  /api/messages → inbox del usuario (o de OTRO usuario vía ?userId=,
 *      auditado — cualquiera puede mirar cualquier bandeja, decisión de Erick
 *      2026-08-07, mismo comportamiento que el EMR legacy).
 * POST /api/messages → crear hilo: primera entrada + destinatarios To/CC.
 *
 * El inbox lista hilos donde el usuario es destinatario, vivos en bandeja:
 * sin delete personal, sin Delete From All, sin borrado del historial. El
 * sello NO filtra por sí mismo — sellar también marca removedFromInboxesAt,
 * y una entrada nueva lo limpia (revive), así que la condición queda simple.
 *
 * El bold es lastEntryAt > lastReadAt; se computa en JS porque Prisma no
 * compara dos columnas entre sí.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, resolveRecipientUsers, sanitizeAttachments } from '@/lib/messaging';
import { archivarAdjuntosDelHilo } from '@/lib/messaging-documents';

const PAGE_SIZE = 15;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const sp = req.nextUrl.searchParams;
  const targetUserId = sp.get('userId') || actor.actorUserId;
  const page = Math.max(1, Number(sp.get('page') || '1'));
  const priority = sp.get('priority'); // NORMAL | URGENT
  const type = sp.get('type'); // ALERT | REMINDER | REQUEST | MESSAGE
  const patientId = sp.get('patientId');

  // Mirar el inbox de otro queda auditado — es la cobertura de "quién leyó qué".
  if (targetUserId !== actor.actorUserId) {
    writeAuditLog(db, {
      ...(await resolveActor(req.headers)),
      action: 'MESSAGING_VIEWED_OTHER_INBOX',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { viewerName: actor.actorName },
    }).catch(() => undefined);
  }

  const where = {
    userId: targetUserId,
    deletedAt: null,
    thread: {
      deletedAt: null,
      removedFromInboxesAt: null,
      ...(priority ? { priority: priority as 'NORMAL' | 'URGENT' } : {}),
      ...(type ? { type: type as 'ALERT' | 'REMINDER' | 'REQUEST' | 'MESSAGE' } : {}),
      ...(patientId ? { patientId } : {}),
    },
  } as const;

  const [total, rows] = await Promise.all([
    db.messageRecipient.count({ where }),
    db.messageRecipient.findMany({
      where,
      orderBy: { thread: { lastEntryAt: 'desc' } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        lastReadAt: true,
        thread: {
          select: {
            id: true,
            subject: true,
            type: true,
            category: true,
            priority: true,
            lastEntryAt: true,
            sealedAt: true,
            patient: { select: { id: true, firstName: true, lastName: true } },
            entries: {
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { authorName: true, kind: true },
            },
          },
        },
      },
    }),
  ]);

  /**
   * Adjuntos de los hilos de ESTA página, para la columna del clip. Consulta
   * aparte y no un `select` anidado: el adjunto cuelga de la entrada, no del
   * hilo, y agrupar acá sale más barato que pedir las entradas con sus archivos
   * de cada hilo. Solo se usan la CANTIDAD y el PRIMERO — con uno se abre el
   * visor directo, con varios se abre el hilo, donde ya son chips.
   */
  const threadIds = rows.map((r) => r.thread.id);
  const attRows = threadIds.length
    ? await db.messageAttachment.findMany({
        where: { entry: { threadId: { in: threadIds } } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fileName: true, entry: { select: { threadId: true } } },
      })
    : [];

  const attByThread = new Map<string, { count: number; first: { id: string; fileName: string } }>();
  for (const a of attRows) {
    const key = a.entry.threadId;
    const prev = attByThread.get(key);
    if (prev) prev.count += 1;
    else attByThread.set(key, { count: 1, first: { id: a.id, fileName: a.fileName } });
  }

  const threads = rows.map((r) => ({
    id: r.thread.id,
    subject: r.thread.subject,
    type: r.thread.type,
    category: r.thread.category,
    priority: r.thread.priority,
    lastEntryAt: r.thread.lastEntryAt,
    sealedAt: r.thread.sealedAt,
    patient: r.thread.patient
      ? {
          id: r.thread.patient.id,
          name: `${r.thread.patient.lastName}, ${r.thread.patient.firstName}`,
        }
      : null,
    lastAuthorName: r.thread.entries[0]?.authorName ?? null,
    lastEntryKind: r.thread.entries[0]?.kind ?? null,
    unread: !r.lastReadAt || r.thread.lastEntryAt > r.lastReadAt,
    attachmentCount: attByThread.get(r.thread.id)?.count ?? 0,
    firstAttachment: attByThread.get(r.thread.id)?.first ?? null,
  }));

  return NextResponse.json({ threads, total, page, pageSize: PAGE_SIZE });
}

interface CreateBody {
  subject?: string;
  body?: string;
  type?: 'ALERT' | 'REMINDER' | 'REQUEST' | 'MESSAGE';
  category?: 'GENERAL' | 'PHONE_MESSAGE' | 'PATIENT_RELATED';
  priority?: 'NORMAL' | 'URGENT';
  to?: string[];
  cc?: string[];
  patientId?: string | null;
  caseId?: string | null;
  attachments?: import('@/lib/messaging').AttachmentInput[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const raw = (await req.json().catch(() => null)) as CreateBody | null;
  if (!raw) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const subject = raw.subject?.trim();
  const body = raw.body?.trim();
  const toIds = [...new Set(raw.to ?? [])];
  const ccIds = [...new Set(raw.cc ?? [])].filter((id) => !toIds.includes(id));

  if (!subject) return NextResponse.json({ error: 'Falta el asunto' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  if (toIds.length === 0) {
    return NextResponse.json({ error: 'Falta al menos un destinatario' }, { status: 400 });
  }

  const [toUsers, ccUsers] = await Promise.all([
    resolveRecipientUsers(toIds),
    resolveRecipientUsers(ccIds),
  ]);
  if (toUsers.length === 0) {
    return NextResponse.json({ error: 'Destinatarios inválidos' }, { status: 400 });
  }

  // El caso solo se acepta si es del paciente indicado — evita cruzar hilos.
  let caseId: string | null = null;
  if (raw.patientId && raw.caseId) {
    const kase = await db.case.findFirst({
      where: { id: raw.caseId, patientId: raw.patientId, deletedAt: null },
      select: { id: true },
    });
    caseId = kase?.id ?? null;
  }

  const attachments = await sanitizeAttachments(raw.attachments, raw.patientId);

  const now = new Date();
  const thread = await db.messageThread.create({
    data: {
      subject,
      type: raw.type ?? 'MESSAGE',
      category: raw.category ?? 'GENERAL',
      priority: raw.priority ?? 'NORMAL',
      patientId: raw.patientId || null,
      caseId,
      createdByUserId: actor.actorUserId,
      createdByName: actor.actorName,
      lastEntryAt: now,
      entries: {
        create: {
          kind: 'MESSAGE',
          authorUserId: actor.actorUserId,
          authorName: actor.actorName,
          body,
          sentAt: now,
          attachments: { create: attachments },
        },
      },
      recipients: {
        create: [
          ...toUsers.map((u) => ({ userId: u.id, userName: u.name, kind: 'TO' as const })),
          ...ccUsers.map((u) => ({ userId: u.id, userName: u.name, kind: 'CC' as const })),
          // El autor participa para ver en su bandeja lo que mandó, con
          // lastReadAt sellado (nadie estrena su propio mensaje en negrita).
          // Si ya está en To/CC no se duplica: la PK es (threadId, userId).
          ...(toUsers.some((u) => u.id === actor.actorUserId) ||
              ccUsers.some((u) => u.id === actor.actorUserId)
            ? []
            : [{
                userId: actor.actorUserId,
                userName: actor.actorName,
                kind: 'SENDER' as const,
                lastReadAt: now,
              }]),
        ],
      },
    },
    select: { id: true },
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_THREAD_CREATED',
    entityType: 'MessageThread',
    entityId: thread.id,
    metadata: {
      subject,
      priority: raw.priority ?? 'NORMAL',
      patientId: raw.patientId ?? null,
      to: toUsers.map((u) => u.name),
      cc: ccUsers.map((u) => u.name),
    },
  }).catch(() => undefined);

  /**
   * Lo que se adjuntó pasa al expediente del caso — ver `messaging-documents`.
   *
   * Se espera (no es fire-and-forget) para que el tab Documentos ya lo tenga
   * cuando la pantalla se refresque después del envío; y no puede tumbar la
   * respuesta, así que va con `.catch`. El mensaje ya está creado y su adjunto
   * se sigue leyendo desde el hilo pase lo que pase acá.
   */
  await archivarAdjuntosDelHilo(thread.id, actor.actorUserId)
    .catch((e) => { console.error('[messages] archivado de adjuntos:', e); });

  return NextResponse.json({ id: thread.id }, { status: 201 });
}
