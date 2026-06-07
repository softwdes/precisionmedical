/**
 * POST /api/admin/intake/[id]/log-contact
 *
 * Registra una comunicación (llamada / email) en el historial del caso.
 * Crea un CaseNote con prefijo emoji (📞 o 📧) para identificar el tipo.
 *
 * Body: {
 *   type:        'call' | 'email'
 *   contactName: string   // "Bob Jones (Smith & Johnson)"
 *   description: string   // "Confirmó representación del caso"
 *   authorName:  string   // Nombre de Edson para el snapshot
 * }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

interface LogContactBody {
  type:        'call' | 'email';
  contactName: string;
  description: string;
  authorName:  string;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor  = actorFromHeaders(req.headers);

  const body = (await req.json()) as LogContactBody;
  if (!body.type || !body.description) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const c = await db.case.findUnique({
    where: { id },
    select: { id: true, caseCode: true },
  });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const prefix = body.type === 'call' ? '📞' : '📧';
  const contact = body.contactName ? ` a ${body.contactName}` : '';
  const content = `${prefix}${contact} — ${body.description}`;

  const note = await db.caseNote.create({
    data: {
      caseId:      id,
      content,
      isPrivate:   true,
      authorUserId: actor.actorUserId ?? undefined,
      authorName:  body.authorName || 'Edson',
    },
    select: {
      id: true, content: true, authorName: true, createdAt: true,
    },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      body.type === 'call' ? 'LOG_CALL' : 'LOG_EMAIL',
    entityType:  'case',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCode: c.caseCode, contactName: body.contactName },
  });

  return NextResponse.json({
    ok:   true,
    note: {
      id:         note.id,
      content:    note.content,
      authorName: note.authorName,
      createdAt:  note.createdAt.toISOString(),
      type:       body.type,
    },
  });
}
