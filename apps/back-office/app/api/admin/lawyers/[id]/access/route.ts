/**
 * Portal Legal · Acceso de un abogado, desde Externals (admin)
 *
 * POST   /api/admin/lawyers/[id]/access   → crea la cuenta y manda el enlace
 * DELETE /api/admin/lawyers/[id]/access   → revoca el acceso
 *
 * La mecánica vive en `lib/lawyer-access.ts`, compartida con el portal del
 * bufete. Acá queda lo propio de esta puerta: quién puede usarla y el audit log.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { grantLawyerAccess, revokeLawyerAccess } from '@/lib/lawyer-access';
import { resolveActor } from '@/lib/actor';

/** Crear credenciales es privilegio de admin, no del módulo Externals. */
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

const HTTP_STATUS: Record<string, number> = {
  NO_EMAIL: 400, NOT_ACTIVE: 400, EMAIL_IN_USE: 409,
  AUTH_CREATE_FAILED: 500, USER_INSERT_FAILED: 500,
  NO_ACCESS: 404, NOT_A_LAWYER_ACCOUNT: 409, BAN_FAILED: 500,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  if (!actor.actorRole || !ADMIN_ROLES.has(actor.actorRole)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const lawyer = await db.lawyer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      firmName: true, status: true,
      parentFirm: { select: { firmName: true } },
    },
  });
  if (!lawyer) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const result = await grantLawyerAccess(lawyer);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: HTTP_STATUS[result.error ?? ''] ?? 500 },
    );
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: result.created ? 'CREATE_LAWYER_ACCESS' : 'RESEND_LAWYER_ACCESS',
    entityType: 'lawyers',
    entityId: lawyer.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      email: lawyer.email,
      directoryUserId: result.directoryUserId,
      emailSent: result.emailSent,
    },
  });

  return NextResponse.json({
    ok: true,
    created: result.created,
    emailSent: result.emailSent,
    // Se devuelve siempre: sin RESEND_API_KEY configurado, copiarlo a mano es la
    // única forma de que la persona entre.
    activationLink: result.activationLink,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  if (!actor.actorRole || !ADMIN_ROLES.has(actor.actorRole)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const lawyer = await db.lawyer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!lawyer) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const result = await revokeLawyerAccess(lawyer);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: HTTP_STATUS[result.error ?? ''] ?? 500 },
    );
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'REVOKE_LAWYER_ACCESS',
    entityType: 'lawyers',
    entityId: lawyer.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { email: lawyer.email, directoryUserId: result.directoryUserId },
  });

  return NextResponse.json({ ok: true });
}
