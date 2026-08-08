/**
 * DELETE /api/messages/templates/[id] — borrado soft de una plantilla.
 * Solo el creador o un admin: las plantillas son compartidas y borrarle la
 * plantilla a toda la clínica no es una acción de cualquiera.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, ADMIN_ROLES } from '@/lib/messaging';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { id } = await ctx.params;

  const tpl = await db.messageTemplate.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, createdByUserId: true },
  });
  if (!tpl) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isAdmin = ADMIN_ROLES.includes(actor.actorRole as (typeof ADMIN_ROLES)[number]);
  if (!isAdmin && tpl.createdByUserId !== actor.actorUserId) {
    return NextResponse.json({ error: 'Solo el creador o un admin' }, { status: 403 });
  }

  await db.messageTemplate.update({ where: { id }, data: { deletedAt: new Date() } });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_TEMPLATE_DELETED',
    entityType: 'MessageTemplate',
    entityId: id,
    metadata: { title: tpl.title },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
