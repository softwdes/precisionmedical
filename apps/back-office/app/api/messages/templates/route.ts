/**
 * Plantillas de mensaje (M1 F4) — el panel del legacy (DM/Prediabetes
 * instructions, Lab results…). Compartidas por toda la clínica.
 *
 * GET  /api/messages/templates?q=   → lista (buscador por título)
 * POST /api/messages/templates      → crear { title, body }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const templates = await db.messageTemplate.findMany({
    where: {
      deletedAt: null,
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, body: true, createdByName: true },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const raw = (await req.json().catch(() => null)) as { title?: string; body?: string } | null;
  const title = raw?.title?.trim();
  const body = raw?.body?.trim();
  if (!title || !body) {
    return NextResponse.json({ error: 'Faltan título o contenido' }, { status: 400 });
  }

  const tpl = await db.messageTemplate.create({
    data: {
      title: title.slice(0, 120),
      body,
      createdByUserId: actor.actorUserId,
      createdByName: actor.actorName,
    },
    select: { id: true, title: true, body: true, createdByName: true },
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_TEMPLATE_CREATED',
    entityType: 'MessageTemplate',
    entityId: tpl.id,
    metadata: { title: tpl.title },
  }).catch(() => undefined);

  return NextResponse.json({ template: tpl }, { status: 201 });
}
