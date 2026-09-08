/**
 * POST /api/attorney/messages/[threadId]/archive — archivar o desarchivar un
 * hilo PARA MÍ: `{ archived: boolean }`.
 *
 * Archivar es personal (columna en la fila del participante) y reversible. No
 * borra nada ni toca a los demás. Si la clínica vuelve a escribir, el hilo
 * vuelve a Recibidos solo (`reviveThread` limpia `archivedAt`), como en Gmail.
 *
 * Misma llave que el resto de la bandeja: ser destinatario. Un id ajeno → 404.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

const Schema = z.object({ archived: z.boolean() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
  const { threadId } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });

  let input: z.infer<typeof Schema>;
  try {
    input = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALIDO' }, { status: 400 });
  }

  const r = await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId, deletedAt: null, thread: { deletedAt: null } },
    data: { archivedAt: input.archived ? new Date() : null },
  });
  if (r.count === 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  writeAuditLog(db, {
    ...actor,
    action: input.archived ? 'MESSAGE_ARCHIVED' : 'MESSAGE_UNARCHIVED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { comoBufete: lawyer.firmName ?? lawyer.id },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, archived: input.archived });
}
