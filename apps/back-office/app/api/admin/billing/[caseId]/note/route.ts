/**
 * POST /api/admin/billing/[caseId]/note
 *
 * Agrega una nota interna de Brunella al caso.
 * Tag prefix:
 *   legal     → ⚖️
 *   insurer   → 🏥
 *   reminder  → ⏰
 *   general   → 📝  (default)
 *
 * Body: { content: string; tag: 'legal' | 'insurer' | 'reminder' | 'general'; authorName?: string }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const TAG_EMOJI: Record<string, string> = {
  legal:    '⚖️',
  insurer:  '🏥',
  reminder: '⏰',
  general:  '📝',
};

interface NoteBody {
  content:     string;
  tag:         string;
  authorName?: string;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = (await req.json()) as NoteBody;
  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'MISSING_CONTENT' }, { status: 400 });
  }

  const c = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true },
  });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const emoji   = TAG_EMOJI[body.tag] ?? TAG_EMOJI['general'];
  const content = `${emoji} ${body.content.trim()}`;

  const note = await db.caseNote.create({
    data: {
      caseId,
      content,
      isPrivate:    true,
      authorUserId: actor.actorUserId ?? undefined,
      authorName:   body.authorName || 'Brunella',
    },
    select: { id: true, content: true, authorName: true, createdAt: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'BILLING_NOTE_ADDED',
    entityType:  'case',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCode: c.caseCode, tag: body.tag },
  });

  return NextResponse.json({
    ok:   true,
    note: {
      id:         note.id,
      content:    note.content,
      authorName: note.authorName,
      createdAt:  note.createdAt.toISOString(),
      tag:        body.tag,
    },
  });
}
