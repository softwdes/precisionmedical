import { Prisma, type PrismaClient, type ActorType, type UserRole } from '@prisma/client';

/**
 * Phoenix 2026-06-05 — Helper to write audit log entries with actorType.
 *
 * Critical for Phase 0+: every mutation on PHI (Phase 1+) or sensitive entity
 * must call this. The actorType field distinguishes HUMAN_USER actions from
 * AI_AGENT (Phase 3+ AI Receptionist) and SYSTEM (cron/webhooks).
 *
 * Idempotency: pass `idempotencyKey` when the caller may retry (e.g. AI agent).
 * Duplicate keys are detected via the @@index — caller should handle.
 *
 * Append-only contract: this helper ONLY writes. Audit logs must never be
 * UPDATEd or DELETEd. A DB trigger (Phase 1, post-BAA Supabase) will enforce
 * this at the DB level.
 */
export interface WriteAuditLogInput {
  actorType: ActorType;          // HUMAN_USER | AI_AGENT | SYSTEM
  actorUserId?: string | null;   // null for SYSTEM and unauthenticated AI calls
  actorRole?: UserRole | null;

  action: string;                // e.g. "CREATE_CASE_FROM_CALL", "SEND_PORTAL_LINK"
  entityType?: string | null;    // e.g. "cases", "appointments"
  entityId?: string | null;

  ipAddress?: string | null;
  userAgent?: string | null;

  before?: Prisma.JsonValue | null;
  after?: Prisma.JsonValue | null;
  metadata?: Prisma.JsonValue | null;

  idempotencyKey?: string | null;
}

export async function writeAuditLog(
  prisma: PrismaClient,
  input: WriteAuditLogInput,
): Promise<{ id: string }> {
  const created = await prisma.auditLog.create({
    data: {
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      before: input.before ?? Prisma.DbNull,
      after: input.after ?? Prisma.DbNull,
      metadata: input.metadata ?? Prisma.DbNull,
      idempotencyKey: input.idempotencyKey ?? null,
    },
    select: { id: true },
  });
  return created;
}

/**
 * Extract actor context from Next.js Request headers.
 * Convention used by the 3 AI Receptionist hook endpoints:
 *   x-actor-type: HUMAN_USER | AI_AGENT | SYSTEM
 *   x-actor-user-id: <user id> (null for SYSTEM/anonymous AI)
 *   x-idempotency-key: <uuid> (optional, used by AI agent for retries)
 *
 * Returns sane defaults if headers missing (HUMAN_USER assumed).
 */
export function actorFromHeaders(headers: Headers): {
  actorType: ActorType;
  actorUserId: string | null;
  idempotencyKey: string | null;
  ipAddress: string | null;
  userAgent: string | null;
} {
  const actorTypeHeader = headers.get('x-actor-type');
  const actorType: ActorType =
    actorTypeHeader === 'AI_AGENT'
      ? 'AI_AGENT'
      : actorTypeHeader === 'SYSTEM'
        ? 'SYSTEM'
        : 'HUMAN_USER';

  return {
    actorType,
    actorUserId: headers.get('x-actor-user-id'),
    idempotencyKey: headers.get('x-idempotency-key'),
    ipAddress:
      headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headers.get('x-real-ip') ??
      null,
    userAgent: headers.get('user-agent'),
  };
}
