/**
 * GET /api/attorney/messages/badge → el contador del sobre en la barra del
 * portal legal: `{ total, unread, urgentUnread }`.
 *
 * El sobre de la barra llamaba a `/api/messages/badge`, que el middleware le
 * prohíbe al rol LAWYER: con "ver como bufete" funcionaba (el que mira es
 * admin) y a un abogado REAL le fallaba en silencio. Esta es su puerta.
 *
 * Mismo criterio que la bandeja: hilos donde figuro como destinatario, vivos.
 * Sin asunto ni paciente en la respuesta — es un número para una pastilla.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });

  const rows = await db.messageRecipient.findMany({
    where: {
      userId: actor.actorUserId,
      deletedAt: null,
      thread: { deletedAt: null, removedFromInboxesAt: null },
    },
    select: { lastReadAt: true, thread: { select: { lastEntryAt: true, priority: true } } },
  });

  let unread = 0;
  let urgentUnread = 0;
  for (const r of rows) {
    const sinLeer = !r.lastReadAt || r.lastReadAt < r.thread.lastEntryAt;
    if (!sinLeer) continue;
    unread += 1;
    if (r.thread.priority === 'URGENT') urgentUnread += 1;
  }

  return NextResponse.json({ total: rows.length, unread, urgentUnread });
}
