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
 * CARPETAS (2026-09-08, como Gmail — mismo criterio que la bandeja del abogado):
 *   ?folder=inbox    (default) hilos con al menos una entrada de OTRO, no
 *                    archivados. Lo que yo mandé y nadie contestó vive en Sent.
 *   ?folder=sent     hilos que abrí yo, con si ya tuvieron respuesta.
 *   ?folder=archived lo que archivé (`archivedAt`) o "quité" antes (`deletedAt`).
 *   ?q=              paciente, código de caso, asunto o remitente.
 *   ?unread=1        solo sin leer (se filtra en memoria, ver abajo).
 * Todo se aplica también a la bandeja AJENA (`?userId=`).
 *
 * El bold es lastEntryAt > lastReadAt; se computa en JS porque Prisma no
 * compara dos columnas entre sí.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, resolveRecipientUsers, sanitizeAttachments, verificarAbogadosEnAlcance } from '@/lib/messaging';
import { archivarAdjuntosDelHilo } from '@/lib/messaging-documents';
import { avisarAbogadosPorEmail } from '@/lib/mensajeria/aviso-abogado';
import { avisarMensajeNuevo } from '@/lib/push';

const PAGE_SIZE = 15;
/** Techo cuando "solo sin leer" obliga a filtrar en memoria. */
const MAX_ESCANEO = 300;
const KINDS_VISIBLES = ['MESSAGE', 'REPLY', 'FORWARD'] as const;

type Folder = 'inbox' | 'sent' | 'archived';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const sp = req.nextUrl.searchParams;
  const targetUserId = sp.get('userId') || actor.actorUserId;
  const page = Math.max(1, Number(sp.get('page') || '1'));
  const priority = sp.get('priority'); // NORMAL | URGENT
  const type = sp.get('type'); // ALERT | REMINDER | REQUEST | MESSAGE | REFERRAL
  const patientId = sp.get('patientId');
  const folder = (['inbox', 'sent', 'archived'].includes(sp.get('folder') ?? '') ? sp.get('folder') : 'inbox') as Folder;
  const q = sp.get('q')?.trim() || null;
  const soloSinLeer = sp.get('unread') === '1';

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

  const entradaAjena: Prisma.MessageEntryWhereInput = {
    authorUserId: { not: targetUserId },
    kind: { in: [...KINDS_VISIBLES] },
  };
  // `deletedAt` es el "quitar de mi bandeja" de antes de la carpeta: hoy se lee
  // como archivado, así que lo viejo aparece en Archivados y no se pierde.
  const porCarpeta: Prisma.MessageRecipientWhereInput =
    folder === 'archived'
      ? { OR: [{ archivedAt: { not: null } }, { deletedAt: { not: null } }] }
      : folder === 'sent'
        ? { archivedAt: null, deletedAt: null, thread: { createdByUserId: targetUserId } }
        : { archivedAt: null, deletedAt: null, thread: { entries: { some: entradaAjena } } };

  const where: Prisma.MessageRecipientWhereInput = {
    userId: targetUserId,
    ...porCarpeta,
    thread: {
      deletedAt: null,
      removedFromInboxesAt: null,
      ...(porCarpeta.thread as Prisma.MessageThreadWhereInput | undefined),
      ...(priority ? { priority: priority as 'NORMAL' | 'URGENT' } : {}),
      ...(type ? { type: type as 'ALERT' | 'REMINDER' | 'REQUEST' | 'MESSAGE' | 'REFERRAL' } : {}),
      ...(patientId ? { patientId } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: 'insensitive' } },
              { createdByName: { contains: q, mode: 'insensitive' } },
              { case: { caseCode: { contains: q, mode: 'insensitive' } } },
              { patient: { firstName: { contains: q, mode: 'insensitive' } } },
              { patient: { lastName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
  };

  const select = {
    lastReadAt: true,
    archivedAt: true,
    deletedAt: true,
    thread: {
      select: {
        id: true,
        subject: true,
        type: true,
        category: true,
        priority: true,
        lastEntryAt: true,
        sealedAt: true,
        firmId: true,
        createdByUserId: true,
        createdByName: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        entries: {
          orderBy: { sentAt: 'desc' as const },
          take: 1,
          select: { authorName: true, authorUserId: true, kind: true },
        },
      },
    },
  };

  // "Solo sin leer" compara dos columnas (lastReadAt vs lastEntryAt), que Prisma
  // no compara: se traen hasta MAX_ESCANEO y se filtra en memoria.
  const [totalBase, rows] = soloSinLeer
    ? await Promise.all([
        Promise.resolve(0),
        db.messageRecipient.findMany({ where, orderBy: { thread: { lastEntryAt: 'desc' } }, take: MAX_ESCANEO, select }),
      ])
    : await Promise.all([
        db.messageRecipient.count({ where }),
        db.messageRecipient.findMany({ where, orderBy: { thread: { lastEntryAt: 'desc' } }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select }),
      ]);

  // El número de la pestaña Recibidos (y del sobre): sin leer, no archivados,
  // con algo escrito por otro. Un solo criterio para las tres puntas.
  const recibidos = await db.messageRecipient.findMany({
    where: {
      userId: targetUserId, archivedAt: null, deletedAt: null,
      thread: { deletedAt: null, removedFromInboxesAt: null, entries: { some: entradaAjena } },
    },
    select: { lastReadAt: true, thread: { select: { lastEntryAt: true } } },
  });
  const unreadInbox = recibidos.filter((r) => !r.lastReadAt || r.thread.lastEntryAt > r.lastReadAt).length;

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

  const mapeados = rows.map((r) => ({
    id: r.thread.id,
    subject: r.thread.subject,
    type: r.thread.type,
    category: r.thread.category,
    priority: r.thread.priority,
    lastEntryAt: r.thread.lastEntryAt,
    sealedAt: r.thread.sealedAt,
    // Lo abrió un bufete desde su portal: la fila lleva la pastilla de origen.
    fromFirm: !!r.thread.firmId,
    patient: r.thread.patient
      ? {
          id: r.thread.patient.id,
          name: `${r.thread.patient.lastName}, ${r.thread.patient.firstName}`,
        }
      : null,
    lastAuthorName: r.thread.entries[0]?.authorName ?? null,
    lastEntryKind: r.thread.entries[0]?.kind ?? null,
    /** Lo abrí yo (la persona cuya bandeja se mira). */
    mine: r.thread.createdByUserId === targetUserId,
    /** Un hilo mío "tiene respuesta" cuando lo último no lo escribí yo. */
    answered: !!r.thread.entries[0] && r.thread.entries[0].authorUserId !== targetUserId,
    archived: !!r.archivedAt || !!r.deletedAt,
    unread: !r.lastReadAt || r.thread.lastEntryAt > r.lastReadAt,
    attachmentCount: attByThread.get(r.thread.id)?.count ?? 0,
    firstAttachment: attByThread.get(r.thread.id)?.first ?? null,
  }));

  const threads = soloSinLeer
    ? mapeados.filter((t) => t.unread).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : mapeados;
  const total = soloSinLeer ? mapeados.filter((t) => t.unread).length : totalBase;

  return NextResponse.json({ threads, total, page, pageSize: PAGE_SIZE, folder, unreadInbox });
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

  // Un abogado solo entra en hilos de casos de SU bufete — ver la función.
  const alcance = await verificarAbogadosEnAlcance(
    [...toUsers, ...ccUsers].map((u) => u.id),
    caseId,
  );
  if (!alcance.ok) {
    return NextResponse.json({ error: alcance.motivo, nombres: alcance.nombres }, { status: 400 });
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

  // Si hay un abogado entre los destinatarios, se le avisa por correo (sin
  // PHI, con el link al hilo). Fire-and-forget: el mensaje ya está guardado.
  void avisarAbogadosPorEmail({
    threadId: thread.id,
    userIds: [...toUsers, ...ccUsers].map((u) => u.id),
    autorUserId: actor.actorUserId,
    autorNombre: actor.actorName,
    caseId,
    patientId: raw.patientId || null,
  }).catch((e) => { console.error('[messages] aviso al abogado:', e); });

  // Y el staff del portal en el teléfono, con la app cerrada. El autor no se
  // avisa a sí mismo aunque se haya puesto en la lista.
  void avisarMensajeNuevo(
    [...toUsers, ...ccUsers].map((u) => u.id).filter((id) => id !== actor.actorUserId),
    actor.actorName,
    thread.id,
    (raw.priority ?? 'NORMAL') === 'URGENT',
  ).catch((e) => { console.error('[messages] aviso al celular:', e); });

  return NextResponse.json({ id: thread.id }, { status: 201 });
}
