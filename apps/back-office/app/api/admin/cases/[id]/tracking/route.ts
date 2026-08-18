/**
 * Cuaderno de Edson sobre el caso — completado / archivado.
 *
 * GET   /api/admin/cases/[id]/tracking   → estado + notas
 * PATCH /api/admin/cases/[id]/tracking   → marca o desmarca completado/archivado
 *
 * Paso 4 de la vista de tracking (docs/plan-vista-edson.md §3.3).
 *
 * El PATCH acepta los dos flags por separado y solo toca el que venga: la
 * grilla marca "completado" con un clic sin arrastrar el estado de archivado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({
  completed: z.boolean().optional(),
  archived: z.boolean().optional(),
}).refine((v) => v.completed !== undefined || v.archived !== undefined, {
  message: 'Mandá al menos uno: completed o archived',
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const [tracking, notes] = await Promise.all([
    db.caseTracking.findUnique({ where: { caseId: id } }),
    db.caseTrackingNote.findMany({
      where: { caseId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return NextResponse.json({ ok: true, tracking, notes });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const now = new Date();
  const stamp = {
    ...(parsed.completed !== undefined
      ? parsed.completed
        ? { completedAt: now, completedById: actor.actorUserId, completedByName: actor.actorName }
        : { completedAt: null, completedById: null, completedByName: null }
      : {}),
    ...(parsed.archived !== undefined
      ? parsed.archived
        ? { archivedAt: now, archivedById: actor.actorUserId, archivedByName: actor.actorName }
        : { archivedAt: null, archivedById: null, archivedByName: null }
      : {}),
  };

  const before = await db.caseTracking.findUnique({ where: { caseId: id } });

  const saved = await db.caseTracking.upsert({
    where:  { caseId: id },
    create: { caseId: id, ...stamp },
    update: stamp,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: parsed.archived !== undefined
      ? (parsed.archived ? 'ARCHIVE_CASE_TRACKING' : 'UNARCHIVE_CASE_TRACKING')
      : (parsed.completed ? 'COMPLETE_CASE_TRACKING' : 'UNCOMPLETE_CASE_TRACKING'),
    entityType: 'case_tracking',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before ? (before as unknown as Prisma.JsonValue) : undefined,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, tracking: saved });
}
