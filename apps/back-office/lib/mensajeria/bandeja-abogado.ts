/**
 * La bandeja del abogado · el criterio de "Recibidos" en UN solo lugar.
 *
 * El sobre del top bar, el ítem del menú y la pestaña Recibidos muestran el
 * mismo número. Si cada uno lo calculara por su lado, tarde o temprano se
 * contradirían (el mismo razonamiento que `lib/vigia/queue.ts`).
 *
 * Recibidos = hilos donde figuro como destinatario, vivos, NO archivados por
 * mí, y con al menos una entrada VISIBLE escrita por otro. Lo que yo mandé y
 * nadie respondió todavía no es "nuevo" para mí: vive en Enviados.
 */

import { db, type Prisma } from '@precision-medical/database';

export const KINDS_VISIBLES_PORTAL = ['MESSAGE', 'REPLY', 'FORWARD'] as const;

export function entradaAjenaA(userId: string): Prisma.MessageEntryWhereInput {
  return { authorUserId: { not: userId }, kind: { in: [...KINDS_VISIBLES_PORTAL] } };
}

export function whereRecibidos(userId: string): Prisma.MessageRecipientWhereInput {
  return {
    userId,
    deletedAt: null,
    archivedAt: null,
    thread: { deletedAt: null, removedFromInboxesAt: null, entries: { some: entradaAjenaA(userId) } },
  };
}

export async function contarRecibidos(userId: string): Promise<{ total: number; unread: number; urgentUnread: number }> {
  const rows = await db.messageRecipient.findMany({
    where: whereRecibidos(userId),
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
  return { total: rows.length, unread, urgentUnread };
}
