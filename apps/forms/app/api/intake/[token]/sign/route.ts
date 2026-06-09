/**
 * B.8 — Firma del Lien · POST
 *
 * POST /api/intake/[token]/sign
 *
 * Guarda la firma del paciente en lien_signatures + marca Case.intakeFormCompletedAt.
 *
 * Body: { signerName: string, signerEmail?: string, signatureSvg?: string }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  // Validate token
  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      intakeFormCompletedAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  // Idempotent — if already completed, return success
  if (rec.intakeFormCompletedAt) {
    return NextResponse.json({ ok: true, alreadyCompleted: true, caseCode: rec.caseCode });
  }

  const body = await req.json() as {
    signerName:   string;
    signerEmail?: string | null;
    signatureSvg?: string;
  };

  if (!body.signerName?.trim()) {
    return NextResponse.json({ error: 'SIGNER_NAME_REQUIRED' }, { status: 400 });
  }

  const ip        = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  // Insert lien signature (append-only — no UPDATE, no DELETE)
  await db.$executeRaw`
    INSERT INTO lien_signatures
      (id, case_id, signer_type, signer_name, signer_email, signature_svg,
       ip_address, user_agent, session_token)
    VALUES (
      gen_random_uuid()::text,
      ${rec.id},
      'PATIENT'::lien_signer_type,
      ${body.signerName.trim()},
      ${body.signerEmail ?? null},
      ${body.signatureSvg ?? null},
      ${ip},
      ${userAgent},
      ${token.slice(0, 32)}
    )
  `;

  // Mark intake complete + transition status
  const newStatus = rec.status === 'INTAKE_PENDING' || rec.status === 'NEW_REFERRAL'
    ? 'INTAKE_COMPLETED'
    : rec.status;

  await db.case.update({
    where: { id: rec.id },
    data: {
      intakeFormCompletedAt: new Date(),
      status: newStatus as 'INTAKE_COMPLETED',
    },
  });

  // Audit log
  await writeAuditLog(db, {
    actorType:    'SYSTEM',
    actorUserId:  null,
    action:       'PATIENT_SIGN_LIEN',
    entityType:   'Case',
    entityId:     rec.id,
    metadata:     {
      signerName:   body.signerName.trim(),
      hasSignature: !!body.signatureSvg,
      ipAddress:    ip,
      token:        token.slice(0, 8) + '…',
    },
  });

  return NextResponse.json({
    ok: true,
    caseCode:    rec.caseCode,
    completedAt: new Date().toISOString(),
  });
}
