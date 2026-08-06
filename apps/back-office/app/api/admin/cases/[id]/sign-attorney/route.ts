/**
 * POST /api/admin/cases/[id]/sign-attorney
 * Saves an attorney lien signature from the back-office.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { signerName, signerEmail, signatureSvg } = body as {
    signerName?: string;
    signerEmail?: string;
    signatureSvg?: string;
  };

  if (!signerName?.trim()) {
    return NextResponse.json({ error: 'MISSING_SIGNER_NAME' }, { status: 400 });
  }
  if (!signatureSvg?.trim()) {
    return NextResponse.json({ error: 'MISSING_SIGNATURE' }, { status: 400 });
  }

  const caseRecord = await db.case.findFirst({
    where: { id: caseId, deletedAt: null },
    select: { id: true, caseCode: true },
  });
  if (!caseRecord) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Idempotency: 409 if attorney already signed
  const existing = await db.lienSignature.findFirst({
    where: { caseId, signerType: 'ATTORNEY' },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'ALREADY_SIGNED', signatureId: existing.id }, { status: 409 });
  }

  const signature = await db.lienSignature.create({
    data: {
      caseId,
      signerType: 'ATTORNEY',
      signerName: signerName.trim(),
      signerEmail: signerEmail?.trim() || null,
      signatureSvg: signatureSvg.trim(),
    },
    select: { id: true, signedAt: true },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    entityType: 'cases',
    entityId: caseId,
    action: 'ATTORNEY_SIGN_LIEN',
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    metadata: { signerName: signerName.trim(), caseCode: caseRecord.caseCode },
  });

  return NextResponse.json(
    { ok: true, signatureId: signature.id, signedAt: signature.signedAt },
    { status: 201 },
  );
}
