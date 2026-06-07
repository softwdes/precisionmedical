/**
 * Front Office · Notas internas del caso.
 *
 * POST /api/admin/cases/[id]/notes
 *   body: { content: string, isPrivate?: boolean }
 *   Crea una nota interna del caso · audit log INSERT_CASE_NOTE.
 *
 * Phase 1A: authorName = "Front Office" placeholder hasta wire auth real.
 * Phase 2: tomar firstName + lastName del usuario logueado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  content: z.string().trim().min(1, 'La nota no puede estar vacía').max(5000, 'Máximo 5000 caracteres'),
  isPrivate: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, deletedAt: true },
  });

  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Phase 1A: authorName placeholder. Phase 2: pull desde user logueado.
  const authorName = 'Front Office';

  const note = await db.caseNote.create({
    data: {
      caseId,
      content: parsed.content,
      isPrivate: parsed.isPrivate,
      authorUserId: actor.actorUserId,
      authorName,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'INSERT_CASE_NOTE',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord.caseCode,
      noteId: note.id,
      isPrivate: note.isPrivate,
      authorName,
      contentPreview: parsed.content.slice(0, 80),
    },
  });

  return NextResponse.json({
    ok: true,
    note: {
      id: note.id,
      content: note.content,
      isPrivate: note.isPrivate,
      authorName: note.authorName,
      authorUserId: note.authorUserId,
      createdAt: note.createdAt,
    },
  });
}
