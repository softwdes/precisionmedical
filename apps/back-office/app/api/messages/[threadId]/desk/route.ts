/**
 * PATCH /api/messages/[threadId]/desk — reasignar un pedido de bufete a otro
 * escritorio: `{ desk }`.
 *
 * Solo admin, y solo sobre hilos que SON pedidos de bufete (tienen `firmId`).
 * Cambia el escritorio del hilo y suma a la gente del nuevo como destinatarios;
 * los anteriores se quedan —lo leyeron, y sacarlos borraría su rastro—. La
 * entrada nueva no existe: el hilo revive en las bandejas y el audit dice quién
 * lo movió y de dónde a dónde.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { requireMessagingActor, reviveThread } from '@/lib/messaging';
import { canSeeFirmRequestsFor } from '@/lib/firm-requests-access';
import { ESCRITORIOS_DE_PEDIDO } from '@/lib/mensajeria/escritorios';
import { miembrosActivos } from '@/lib/mensajeria/escritorios-server';

type Ctx = { params: Promise<{ threadId: string }> };
// Solo entre los tres escritorios de pedidos: un referido no se "reasigna",
// tiene su propio escritorio y su propio flujo (crear el caso).
const Schema = z.object({ desk: z.enum(ESCRITORIOS_DE_PEDIDO) });

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  // La misma llave que la pantalla: admin por rol o la casilla "Pedidos de bufetes".
  if (!actor.email || !(await canSeeFirmRequestsFor(actor.email))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const { threadId } = await ctx.params;

  let input: z.infer<typeof Schema>;
  try {
    input = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALIDO' }, { status: 400 });
  }

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, deletedAt: null, firmId: { not: null }, type: { not: 'REFERRAL' } },
    select: { id: true, desk: true, subject: true },
  });
  if (!thread) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (thread.desk === input.desk) return NextResponse.json({ ok: true, sinCambios: true });

  // Reasignar a un escritorio vacío es mandarlo a nadie: se rechaza y la
  // pantalla manda a Configuración a poner gente primero.
  const miembros = await miembrosActivos(input.desk);
  if (miembros.length === 0) {
    return NextResponse.json({ error: 'ESCRITORIO_VACIO' }, { status: 409 });
  }

  const now = new Date();
  await db.$transaction([
    db.messageThread.update({ where: { id: threadId }, data: { desk: input.desk } }),
    db.messageRecipient.createMany({
      data: miembros.map((m) => ({ threadId, userId: m.id, userName: m.name, kind: 'TO' as const })),
      skipDuplicates: true,
    }),
  ]);
  await reviveThread(threadId, now);

  await writeAuditLog(db, {
    ...actor,
    action: 'MESSAGE_DESK_REASSIGNED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { de: thread.desk, a: input.desk, subject: thread.subject, sumados: miembros.map((m) => m.name) },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true, desk: input.desk, sumados: miembros.map((m) => m.name) });
}
