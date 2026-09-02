/**
 * POST /api/admin/cases/[id]/generate-portal-token
 *
 * Devuelve el magic link del portal para un caso, sin enviar SMS/email.
 * Usado por `IntakeFormLinkDialog` (QR/tablet) y por el alta de caso.
 * Retorna: { portalUrl, magicToken, reused }
 *
 * ⚠️ **Ya NO regenera por defecto.** Se llamaba desde un `useEffect` al abrir el
 * diálogo del QR, así que abrir la pantalla de un caso mataba en silencio el
 * link que el paciente ya tenía en su SMS. Ahora reusa el token vivo y solo
 * emite uno nuevo cuando el staff lo pide con `{ regenerar: true }`, que es un
 * acto explícito con su propia entrada en el audit log. Ver el porqué completo
 * y los números en `lib/portal-token.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { obtenerPortalToken } from '@/lib/portal-token';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveActor(req.headers);
  const { id: caseId } = await params;

  let body: { regenerar?: boolean } = {};
  try { body = await req.json(); } catch { /* sin cuerpo: reusar */ }
  const regenerar = body.regenerar === true;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, status: true },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const emitido = await obtenerPortalToken(caseId, { revocarElAnterior: regenerar });
  if (!emitido) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // El status solo avanza cuando el caso todavía estaba sin tocar. Reusar el
  // token no es un evento del caso, pero un NEW_REFERRAL cuyo link ya se puede
  // abrir sí está, de hecho, esperando el intake.
  if (caseRecord.status === 'NEW_REFERRAL') {
    await db.case.update({
      where: { id: caseId },
      data:  { status: 'INTAKE_PENDING' },
    });
  }

  // Reusar no se audita: no cambió nada, y una entrada por cada apertura del
  // diálogo enterraría las que sí importan. Se audita EMITIR — y revocar lleva
  // su propia acción, porque deja sin acceso a quien ya tenía el link.
  if (!emitido.reusado) {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: regenerar ? 'REVOKE_PORTAL_TOKEN' : 'GENERATE_PORTAL_TOKEN',
      entityType: 'cases',
      entityId: caseId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      // El token queda fuera del log: es la credencial de acceso al portal.
      metadata: { caseCode: caseRecord.caseCode, via: 'QR' },
    });
  }

  return NextResponse.json({
    ok: true,
    portalUrl:  emitido.portalUrl,
    magicToken: emitido.token,
    /** `true` = es el mismo link que ya se le envió al paciente. */
    reused:     emitido.reusado,
  });
}
