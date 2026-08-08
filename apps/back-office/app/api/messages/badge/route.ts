/**
 * GET /api/messages/badge → { unread, urgentUnread } del usuario logueado.
 *
 * Alimenta el sobre del top bar: badge normal con `unread`, pulso rojo si
 * `urgentUnread > 0`. Pensado para polling ligero (~45s) — una sola query
 * agregada, sin filas. Raw SQL porque el bold compara dos columnas entre sí
 * (lastEntryAt > lastReadAt), cosa que el query builder de Prisma no expresa.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  // total = hilos vivos en bandeja; unread = subconjunto en negrita. El botón
  // del top bar muestra "(unread/total)" igual que el Msgs (67/178) del legacy.
  const rows = await db.$queryRaw<Array<{ total: bigint; unread: bigint; urgentUnread: bigint }>>`
    SELECT COUNT(*) AS "total",
           COUNT(*) FILTER (WHERE r."lastReadAt" IS NULL OR t."lastEntryAt" > r."lastReadAt")
             AS "unread",
           COUNT(*) FILTER (WHERE t."priority" = 'URGENT'
             AND (r."lastReadAt" IS NULL OR t."lastEntryAt" > r."lastReadAt"))
             AS "urgentUnread"
      FROM "message_recipients" r
      JOIN "message_threads"    t ON t."id" = r."threadId"
     WHERE r."userId" = ${actor.actorUserId}
       AND r."deletedAt" IS NULL
       AND t."deletedAt" IS NULL
       AND t."removedFromInboxesAt" IS NULL
  `;

  return NextResponse.json({
    total: Number(rows[0]?.total ?? 0),
    unread: Number(rows[0]?.unread ?? 0),
    urgentUnread: Number(rows[0]?.urgentUnread ?? 0),
    // Identidad para los diálogos del sobre (evita prop-drilling por layouts)
    userId: actor.actorUserId,
    isAdmin: actor.actorRole === 'SUPER_ADMIN' || actor.actorRole === 'ADMIN',
  });
}
