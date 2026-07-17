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
    take: 200,
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
    events: events.map((e) => {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      return {
        id:             e.id,
        action:         e.action,
        actorType:      e.actorType,
        createdAt:      e.createdAt.toISOString(),
        // Assignment change fields (migrated from v2 or captured in v3)
        isAssignment:   e.action === 'ASSIGNMENT_CHANGE',
        changeType:     meta.changeType     as string | null ?? null,
        changeAction:   meta.action         as string | null ?? null,
        changedByEmail: meta.changedByEmail as string | null ?? null,
        previousValue:  meta.previousValue  as string | null ?? null,
        newValue:       meta.newValue       as string | null ?? null,
        // Generic metadata for other events
        metadata:       meta,
      };
    }),
  });
}
