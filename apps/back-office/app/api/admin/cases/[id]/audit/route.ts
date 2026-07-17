/**
 * GET /api/admin/cases/[id]/audit
 * Returns audit log events for a case, newest first.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const events = await db.auditLog.findMany({
    where: { entityType: 'cases', entityId: caseId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorUserId: true,
      createdAt: true,
      metadata: true,
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      actorType: e.actorType,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
  });
}
