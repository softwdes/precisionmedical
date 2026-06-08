/**
 * POST /api/cases/[caseId]/sign
 * B.22 — Guardar firma digital del lien por el abogado
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ caseId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { caseId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = await req.json() as {
    signerName:   string;
    signerEmail?: string;
    signatureSvg: string;
  };

  if (!body.signerName || !body.signatureSvg) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const c = await db.case.findUnique({ where: { id: caseId, deletedAt: null }, select: { id: true, caseCode: true } });
  if (!c) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.$executeRaw`
    INSERT INTO lien_signatures
      (id, case_id, signer_type, signer_name, signer_email, signature_svg, ip_address, user_agent)
    VALUES (
      gen_random_uuid()::text,
      ${caseId},
      'ATTORNEY'::lien_signer_type,
      ${body.signerName},
      ${body.signerEmail ?? null},
      ${body.signatureSvg},
      ${actor.ipAddress ?? null},
      ${actor.userAgent ?? null}
    )
  `;

  const [sig] = await db.$queryRaw<{ id: string; signed_at: Date }[]>`
    SELECT id, signed_at FROM lien_signatures
    WHERE case_id = ${caseId} AND signer_type = 'ATTORNEY'
    ORDER BY signed_at DESC LIMIT 1
  `;

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'ATTORNEY_SIGN_LIEN',
    entityType:  'case',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCode: c.caseCode, signerName: body.signerName, sigId: sig?.id },
  });

  return NextResponse.json({ ok: true, signatureId: sig?.id, signedAt: sig?.signed_at }, { status: 201 });
}
