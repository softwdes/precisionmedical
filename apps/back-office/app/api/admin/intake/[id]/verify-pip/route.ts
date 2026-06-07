/**
 * POST /api/admin/intake/[id]/verify-pip
 *
 * Marca el seguro PIP de un caso como verificado por Edson.
 * Actualiza pipVerifiedAt + pipVerifiedById + escribe audit log.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor  = actorFromHeaders(req.headers);

  const c = await db.case.findUnique({
    where: { id },
    select: { id: true, caseCode: true, pipVerifiedAt: true },
  });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const now = new Date();
  await db.case.update({
    where: { id },
    data:  {
      pipVerifiedAt:    now,
      pipVerifiedById:  actor.actorUserId ?? undefined,
    },
  });

  await writeAuditLog(db, {
    actorType:    actor.actorType,
    actorUserId:  actor.actorUserId,
    action:       'VERIFY_PIP',
    entityType:   'case',
    entityId:     id,
    ipAddress:    actor.ipAddress,
    userAgent:    actor.userAgent,
    metadata:     { caseCode: c.caseCode },
  });

  return NextResponse.json({ ok: true, pipVerifiedAt: now.toISOString() });
}
