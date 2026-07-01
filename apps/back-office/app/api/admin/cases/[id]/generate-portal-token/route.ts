/**
 * POST /api/admin/cases/[id]/generate-portal-token
 *
 * Genera (o regenera) el magic token del portal para un caso sin enviar SMS/email.
 * Usado por QuickRegisterDialog al presionar "Guardar y generar QR".
 * Retorna: { portalUrl, magicToken, expiresAt }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, status: true },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const magicToken = `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const expiresIn24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const portalBase = process.env.PORTAL_URL ?? 'http://localhost:3004';
  const portalUrl = `${portalBase}/c/${magicToken}`;

  await db.case.update({
    where: { id: caseId },
    data: {
      portalToken: magicToken,
      status: caseRecord.status === 'NEW_REFERRAL' ? 'INTAKE_PENDING' : caseRecord.status,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'GENERATE_PORTAL_TOKEN',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord.caseCode, via: 'QR' },
  });

  return NextResponse.json({ ok: true, portalUrl, magicToken, expiresAt: expiresIn24h.toISOString() });
}
