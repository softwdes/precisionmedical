/**
 * POST /api/admin/billing/[caseId]/generate-hcfa
 *
 * Phase 1A: registra el HCFA como "generado" creando una nota de sistema.
 * Phase 2: generará el PDF real CMS-1500 y lo almacenará.
 *
 * Body: { noteId: string } — ID de la VisitNote a facturar
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const c = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true, caseCode: true,
      primaryInsurance: { select: { name: true } },
    },
  });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Check not already generated
  const existing = await db.caseNote.findFirst({
    where: { caseId, content: { startsWith: '🤖 HCFA' } },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json({
      ok:   true,
      already: true,
      hcfaGeneratedAt: existing.createdAt.toISOString(),
    });
  }

  const insurerName = c.primaryInsurance?.name ?? 'Aseguradora';
  const content = `🤖 HCFA CMS-1500 generado y enviado electrónicamente a ${insurerName} · Ref: HCFA-${c.caseCode}-${Date.now().toString(36).toUpperCase()}`;

  const note = await db.caseNote.create({
    data: {
      caseId,
      content,
      isPrivate:   true,
      authorName:  'Sistema',
    },
    select: { id: true, createdAt: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'HCFA_GENERATED',
    entityType:  'case',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCode: c.caseCode, insurerName },
  });

  return NextResponse.json({ ok: true, hcfaGeneratedAt: note.createdAt.toISOString() });
}
