/**
 * Phase 1A dev helper — Simula que el paciente completó el portal (B.5-B.9).
 *
 * POST /api/admin/cases/[id]/mark-intake-complete
 *
 * En Phase 2 con BAA Supabase + portal real (B.5-B.9), esta transición la
 * dispara el portal cuando el paciente termina su intake. Phase 1A no
 * tenemos portal funcional, así que este endpoint permite simular el flujo.
 *
 * Status flow: INTAKE_PENDING → INTAKE_COMPLETED
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await ctx.params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, status: true },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  if (caseRecord.status !== 'INTAKE_PENDING') {
    return NextResponse.json(
      { error: 'INVALID_STATUS', message: `Esperado INTAKE_PENDING, encontrado ${caseRecord.status}.` },
      { status: 409 },
    );
  }

  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      status: 'INTAKE_COMPLETED',
      intakeFormCompletedAt: new Date(),
    },
  });

  await writeAuditLog(db, {
    actorType: 'SYSTEM', // Simula que vino del portal
    actorUserId: actor.actorUserId,
    action: 'MARK_INTAKE_COMPLETE_DEV',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      phase: '1A_dev_helper',
      stub: true,
      caseCode: caseRecord.caseCode,
      previousStatus: 'INTAKE_PENDING',
      newStatus: 'INTAKE_COMPLETED',
    },
  });

  return NextResponse.json({
    ok: true,
    case: { id: updated.id, caseCode: updated.caseCode, status: updated.status },
    message: 'Phase 1A dev helper · Phase 2 esta transición la dispara el portal real.',
  });
}
