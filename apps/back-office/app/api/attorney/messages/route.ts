/**
 * GET /api/attorney/messages — la bandeja del abogado, por CARPETA (Gmail).
 *
 *   ?folder=inbox    (default) lo que la clínica le escribió: hilos con al
 *                    menos una entrada ajena. Es la única carpeta que cuenta
 *                    no leídos para el sobre y el menú.
 *   ?folder=sent     lo que pidió el bufete: hilos que él abrió (pedidos y
 *                    referidos), con su estado. Un hilo respondido está en las
 *                    dos carpetas, como en Gmail.
 *   ?folder=archived lo que archivó para sí (`archivedAt`).
 *   ?q=              cliente, código de caso o asunto.
 *   ?unread=1        solo sin leer · ?urgent=1 solo urgentes.
 *   ?priority=       NORMAL | URGENT · ?type= MESSAGE|ALERT|REMINDER|REQUEST|REFERRAL
 *   ?page=           25 por página.
 *
 * Ruta propia y no `/api/messages`: por ahí también viajan los adjuntos, las
 * plantillas, el listado de staff y el "ver inbox de…", que son herramientas
 * internas. Abrirle todo eso a un externo para que pueda leer sus mensajes sería
 * pagar un precio enorme por una lista.
 *
 * El alcance no necesita filtro nuevo: la bandeja ya es "los hilos donde figuro
 * como destinatario" (`message_recipients.userId = yo`). Un abogado ve lo que le
 * escribieron y nada más — por construcción, igual que cualquier empleado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, type Prisma } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';
import { contarRecibidos, entradaAjenaA, KINDS_VISIBLES_PORTAL as KINDS_VISIBLES } from '@/lib/mensajeria/bandeja-abogado';

const PAGE_SIZE = 25;
/** Techo cuando hay que filtrar en memoria (sin leer): se recorre hasta acá. */
const MAX_ESCANEO = 300;

type Folder = 'inbox' | 'sent' | 'archived';

/** Tipos que el filtro acepta. Fuera de la lista, el parámetro se ignora. */
const TIPOS = ['MESSAGE', 'ALERT', 'REMINDER', 'REQUEST', 'REFERRAL'] as const;
type Tipo = (typeof TIPOS)[number];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  /**
   * La identidad es la de la SESIÓN, no la de la ficha que se está mirando.
   *
   * Un admin con "ver como bufete" puesto tiene que ver SU bandeja, no la del
   * despacho: la bandeja es de una persona. Si saliera de `lawyer.userId`, el
   * admin leería los mensajes de otro — que es exactamente la fuga que este
   * portal existe para evitar.
   */
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });
  const yo = actor.actorUserId;

  const sp = req.nextUrl.searchParams;
  const folder = (['inbox', 'sent', 'archived'].includes(sp.get('folder') ?? '') ? sp.get('folder') : 'inbox') as Folder;
  const q = sp.get('q')?.trim() || null;
  const soloSinLeer = sp.get('unread') === '1';
  const soloUrgentes = sp.get('urgent') === '1';
  // Filtros finos, los mismos que la bandeja de la clínica: el chip Urgentes
  // manda sobre el select de prioridad (si el chip está puesto, el select ni
  // se muestra en la UI).
  const priority = sp.get('priority');
  const type = sp.get('type');
  const page = Math.max(1, Number(sp.get('page') ?? '1'));

  const entradaAjena = entradaAjenaA(yo);

  const porCarpeta: Prisma.MessageRecipientWhereInput =
    folder === 'archived'
      ? { archivedAt: { not: null } }
      : folder === 'sent'
        ? { archivedAt: null, thread: { createdByUserId: yo } }
        : { archivedAt: null, thread: { entries: { some: entradaAjena } } };

  const where: Prisma.MessageRecipientWhereInput = {
    userId: yo,
    deletedAt: null,
    ...porCarpeta,
    thread: {
      deletedAt: null,
      removedFromInboxesAt: null,
      ...(porCarpeta.thread as Prisma.MessageThreadWhereInput | undefined),
      ...(soloUrgentes
        ? { priority: 'URGENT' as const }
        : priority === 'URGENT' || priority === 'NORMAL'
          ? { priority }
          : {}),
      ...(type && TIPOS.includes(type as Tipo) ? { type: type as Tipo } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: 'insensitive' } },
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
    thread: {
      select: {
        id: true,
        subject: true,
        priority: true,
        lastEntryAt: true,
        createdByUserId: true,
        createdByName: true,
        desk: true,
        type: true,
        referral: { select: { status: true, convertedByName: true } },
        case: { select: { caseCode: true } },
        patient: { select: { firstName: true, lastName: true } },
        // Solo lo que el portal muestra: las notas internas no cuentan.
        entries: {
          where: { kind: { in: [...KINDS_VISIBLES] } },
          orderBy: { sentAt: 'desc' as const },
          select: { authorUserId: true, authorName: true, _count: { select: { attachments: true } } },
        },
      },
    },
  };

  // "Solo sin leer" se decide comparando dos columnas (lastReadAt vs
  // lastEntryAt), que Prisma no compara: se traen hasta MAX_ESCANEO y se filtra
  // en memoria. El resto pagina en la base.
  const [total, filas] = soloSinLeer
    ? await Promise.all([
        Promise.resolve(0),
        db.messageRecipient.findMany({ where, orderBy: { thread: { lastEntryAt: 'desc' } }, take: MAX_ESCANEO, select }),
      ])
    : await Promise.all([
        db.messageRecipient.count({ where }),
        db.messageRecipient.findMany({ where, orderBy: { thread: { lastEntryAt: 'desc' } }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select }),
      ]);

  const mapeadas = filas.map((r) => {
    const ultima = r.thread.entries[0];
    const unread = !r.lastReadAt || r.lastReadAt < r.thread.lastEntryAt;
    return {
      id: r.thread.id,
      subject: r.thread.subject,
      priority: r.thread.priority,
      desk: r.thread.desk,
      type: r.thread.type,
      referralStatus: r.thread.referral?.status ?? null,
      from: r.thread.createdByName,
      // Quién escribió lo ÚLTIMO: en una bandeja tipo correo es lo que se lee
      // primero, y no siempre coincide con quien abrió el hilo.
      lastFrom: ultima?.authorName ?? r.thread.createdByName,
      lastFromMe: ultima ? ultima.authorUserId === yo : r.thread.createdByUserId === yo,
      mine: r.thread.createdByUserId === yo,
      // Un pedido mío "tiene respuesta" cuando lo último NO lo escribí yo.
      answered: !!ultima && ultima.authorUserId !== yo,
      caseCode: r.thread.case?.caseCode ?? null,
      patientName: r.thread.patient ? `${r.thread.patient.firstName} ${r.thread.patient.lastName}`.trim() : null,
      lastEntryAt: r.thread.lastEntryAt,
      entries: r.thread.entries.length,
      attachments: r.thread.entries.reduce((n, e) => n + e._count.attachments, 0),
      archived: !!r.archivedAt,
      // Sin fecha de lectura, o con una anterior al último mensaje: no leído.
      unread,
    };
  });

  const threads = soloSinLeer
    ? mapeadas.filter((t) => t.unread).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : mapeadas;
  const totalFinal = soloSinLeer ? mapeadas.filter((t) => t.unread).length : total;

  // El número del sobre, del menú y de la pestaña Recibidos: UNO solo
  // (`contarRecibidos`), para que las tres puntas no se contradigan.
  const { unread: unreadInbox } = await contarRecibidos(yo);

  return NextResponse.json({ folder, total: totalFinal, page, pageSize: PAGE_SIZE, unreadInbox, threads });
}
