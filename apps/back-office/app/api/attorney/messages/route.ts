/**
 * GET /api/attorney/messages — la bandeja del abogado.
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
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

const PAGE_SIZE = 25;

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

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'));

  const where = {
    userId: actor.actorUserId,
    deletedAt: null,
    thread: { deletedAt: null, removedFromInboxesAt: null },
  };

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
            priority: true,
            lastEntryAt: true,
            createdByName: true,
            case: { select: { caseCode: true } },
            _count: { select: { entries: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    threads: rows.map((r) => ({
      id: r.thread.id,
      subject: r.thread.subject,
      priority: r.thread.priority,
      from: r.thread.createdByName,
      caseCode: r.thread.case?.caseCode ?? null,
      lastEntryAt: r.thread.lastEntryAt,
      entries: r.thread._count.entries,
      // Sin fecha de lectura, o con una anterior al último mensaje: no leído.
      unread: !r.lastReadAt || r.lastReadAt < r.thread.lastEntryAt,
    })),
  });
}
