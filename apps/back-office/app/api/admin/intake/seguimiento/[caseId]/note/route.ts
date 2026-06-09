import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

/**
 * POST /api/admin/intake/seguimiento/[caseId]/note
 *
 * Registra una acción de seguimiento de Edson en el timeline del caso.
 *
 * Body: { type: 'call' | 'email' | 'payment' | 'escalate' | 'note'; content: string; amount?: number; authorName?: string }
 * - 'call'     → 📞 Llamada al bufete — {content}
 * - 'email'    → 📧 Email enviado — {content}
 * - 'payment'  → 💰 Pago parcial ${amount} — {content}
 * - 'escalate' → 🚨 Escalado a Brunella — {content}
 * - 'note'     → 📝 {content}
 */

const TYPE_CONFIG: Record<string, { emoji: string; prefix: string; action: string }> = {
  call:    { emoji: '📞', prefix: '📞 Llamada al bufete', action: 'SEGUIMIENTO_CALL_LOGGED' },
  email:   { emoji: '📧', prefix: '📧 Email enviado',     action: 'SEGUIMIENTO_EMAIL_LOGGED' },
  payment: { emoji: '💰', prefix: '💰 Pago parcial',      action: 'SEGUIMIENTO_PAYMENT_LOGGED' },
  escalate:{ emoji: '🚨', prefix: '🚨 Escalado a Brunella', action: 'SEGUIMIENTO_ESCALATED' },
  note:    { emoji: '📝', prefix: '📝',                    action: 'SEGUIMIENTO_NOTE_ADDED' },
};

interface NoteBody {
  type:        string;
  content:     string;
  amount?:     number;
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
    where:  { id: caseId },
    select: { id: true, caseCode: true },
  });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const cfg    = TYPE_CONFIG[body.type] ?? TYPE_CONFIG['note']!;
  const amtStr = body.amount ? ` $${body.amount.toFixed(2)}` : '';
  const content = `${cfg.prefix}${amtStr} — ${body.content.trim()}`;

  const note = await db.caseNote.create({
    data: {
      caseId,
      content,
      isPrivate:    true,
      authorUserId: actor.actorUserId ?? undefined,
      authorName:   body.authorName || 'Edson',
    },
    select: { id: true, content: true, authorName: true, createdAt: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      cfg.action,
    entityType:  'case',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      caseCode: c.caseCode,
      type:     body.type,
      amount:   body.amount ?? null,
    },
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
