/**
 * B.3 — Send portal magic link
 *
 * POST /api/admin/cases/[id]/send-portal-link
 *
 * Phase 1A: mock. NO se envía SMS real (Weave BAA pendiente).
 * Phase 2: integra Weave API real.
 *
 * Flow:
 * 1. Generate magic token (CUID-like)
 * 2. Update Case.intakeFormSentAt + intakeFormSentVia
 * 3. Update Case.status: NEW_REFERRAL → INTAKE_PENDING
 * 4. Write audit log con action SEND_PORTAL_LINK
 * 5. Return mock magic link URL for dev display
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  via: z.enum(['SMS', 'EMAIL']).default('SMS'),
  language: z.enum(['es', 'en']).default('es'),
  customMessage: z.string().max(500).optional(),
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

  // Find case + patient
  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Validation
  if (parsed.via === 'SMS' && !caseRecord.patient.phone) {
    return NextResponse.json({ error: 'NO_PHONE', message: 'Paciente no tiene teléfono registrado' }, { status: 400 });
  }
  if (parsed.via === 'EMAIL' && !caseRecord.patient.email) {
    return NextResponse.json({ error: 'NO_EMAIL', message: 'Paciente no tiene email registrado' }, { status: 400 });
  }

  // Generate magic token (Phase 1A simple; Phase 2 con Supabase Auth magic links)
  const magicToken = `mt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const expiresIn24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const portalUrl = `https://portal.lienmaster.net/auth?token=${magicToken}&case=${caseRecord.caseCode}`;

  // SMS template
  const recipient = parsed.via === 'SMS' ? caseRecord.patient.phone! : caseRecord.patient.email!;
  const messageBody = parsed.language === 'es'
    ? `Hola ${caseRecord.patient.firstName}, soy de Precision Medical. Para completar tu intake del caso ${caseRecord.caseCode}, click: ${portalUrl}. Expira en 24h. Dudas: (801) 375-2207.`
    : `Hi ${caseRecord.patient.firstName}, this is Precision Medical. To complete intake for case ${caseRecord.caseCode}, click: ${portalUrl}. Expires in 24h. Questions: (801) 375-2207.`;

  // Update case
  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      intakeFormSentAt: new Date(),
      intakeFormSentVia: parsed.via,
      status: caseRecord.status === 'NEW_REFERRAL' ? 'INTAKE_PENDING' : caseRecord.status,
    },
  });

  // Audit log con detalles del envío
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SEND_PORTAL_LINK',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      phase: '1A_mock',
      stub: true,
      via: parsed.via,
      language: parsed.language,
      recipientLast4: recipient.slice(-4), // No PHI completa en log
      magicToken, // Phase 1A: visible para testing local. Phase 2: hash.
      expiresAt: expiresIn24h.toISOString(),
      caseCode: caseRecord.caseCode,
      previousStatus: caseRecord.status,
      newStatus: updated.status,
    },
  });

  return NextResponse.json({
    ok: true,
    stub: true,
    case: { id: updated.id, caseCode: updated.caseCode, status: updated.status },
    sent: {
      via: parsed.via,
      to: recipient,
      language: parsed.language,
      magicToken,
      portalUrl,
      messageBody,
      expiresAt: expiresIn24h.toISOString(),
    },
    message: 'Phase 1A stub · NO SMS real enviado. Weave wire en Phase 2 después de BAA.',
  });
}
