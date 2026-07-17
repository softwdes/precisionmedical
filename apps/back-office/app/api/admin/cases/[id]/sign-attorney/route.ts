/**
 * POST /api/admin/cases/[id]/sign-attorney
 * Saves an attorney lien signature from the back-office.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

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
  const existing = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM lien_signatures
    WHERE case_id = ${caseId} AND signer_type = 'ATTORNEY'::"LienSignerType"
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: 'ALREADY_SIGNED', signatureId: existing[0]!.id }, { status: 409 });
  }

  await db.$executeRaw`
    INSERT INTO lien_signatures (id, case_id, signer_type, signer_name, signer_email, signature_svg, signed_at, created_at)
    VALUES (
      gen_random_uuid(),
      ${caseId},
      'ATTORNEY'::"LienSignerType",
      ${signerName.trim()},
      ${signerEmail?.trim() ?? null},
      ${signatureSvg.trim()},
      NOW(),
      NOW()
    )
  `;

  const inserted = await db.$queryRaw<Array<{ id: string; signed_at: Date }>>`
    SELECT id, signed_at FROM lien_signatures
    WHERE case_id = ${caseId} AND signer_type = 'ATTORNEY'::"LienSignerType"
    ORDER BY signed_at DESC LIMIT 1
  `;

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    entityType: 'cases',
    entityId: caseId,
    action: 'ATTORNEY_SIGN_LIEN',
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    metadata: { signerName: signerName.trim(), caseCode: caseRecord.caseCode },
  });

  return NextResponse.json(
    { ok: true, signatureId: inserted[0]?.id, signedAt: inserted[0]?.signed_at },
    { status: 201 },
  );
}
