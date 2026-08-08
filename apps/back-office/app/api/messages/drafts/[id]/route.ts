/**
 * DELETE /api/messages/drafts/[id] — descartar un borrador (o limpiarlo tras
 * enviar). Solo el dueño: los borradores son privados.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { id } = await ctx.params;

  await db.messageDraft.deleteMany({ where: { id, userId: actor.actorUserId } });
  return NextResponse.json({ ok: true });
}
