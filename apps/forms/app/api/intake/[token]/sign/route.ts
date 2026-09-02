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
import { db, writeAuditLog, isMinor } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

/**
 * Freno por IP.
 *
 * El lien se firma UNA vez por caso, así que el techo puede ser bajo: lo que
 * queda cubierto es el sondeo de tokens (cada POST dice si el token existe con
 * un 404 contra un 200) y el reintento automatizado. Su gemela de confirmación
 * de cita —`confirmar/[token]/sign`— ya tenía freno; esta se había quedado sin.
 */
const LIMITE = { max: 10, ventanaMs: 10 * 60 * 1000 };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const freno = rateLimit(claveDeIp(req, 'intake-sign'), LIMITE);
  if (!freno.ok) {
    return NextResponse.json(
      { error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  // Validate token
  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      caseType: true,
      intakeFormCompletedAt: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true, dateOfBirth: true,
          guardianPatientId: true,
        },
      },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  const body = await req.json() as {
    signerName:   string;
    signerEmail?: string | null;
    signatureSvg?: string;
  };

  // Solo los casos MVA llevan lien. Para el resto (GENERAL/GM, etc.) el intake
  // se cierra sin firma y NO se crea registro en lien_signatures — seria un
  // documento legal inexistente.
  //
  // La decision se toma con el caseType de la DB, no con un flag del cliente:
  // si viniera del body se podria saltar el lien de un MVA manipulando el POST.
  const requiresLien = rec.caseType === 'MVA';

  if (requiresLien && !body.signerName?.trim()) {
    return NextResponse.json({ error: 'SIGNER_NAME_REQUIRED' }, { status: 400 });
  }

  const ip        = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  // Quién firma: si el paciente es menor y tiene apoderado vinculado, la firma
  // se registra como GUARDIAN. Dejarla como PATIENT sería incorrecto en el
  // registro legal — un menor no puede firmar el lien.
  // Se decide con datos de la DB, no con lo que manda el cliente.
  const firmaDeApoderado = isMinor(rec.patient.dateOfBirth) && !!rec.patient.guardianPatientId;

  // Insert lien signature (append-only — no UPDATE, no DELETE)
  if (requiresLien) {
    await db.lienSignature.create({
      data: {
        caseId:       rec.id,
        signerType:   firmaDeApoderado ? 'GUARDIAN' : 'PATIENT',
        signerName:   body.signerName.trim(),
        signerEmail:  body.signerEmail ?? null,
        signatureSvg: body.signatureSvg ?? null,
        ipAddress:    ip,
        userAgent,
        sessionToken: token.slice(0, 32),
      },
    });
  }

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

  // Audit log — la accion distingue si hubo lien o si el intake se cerro sin el
  await writeAuditLog(db, {
    actorType:    'SYSTEM',
    actorUserId:  null,
    action:       requiresLien ? 'PATIENT_SIGN_LIEN' : 'PATIENT_COMPLETE_INTAKE',
    entityType:   'Case',
    entityId:     rec.id,
    metadata:     {
      signerName:   body.signerName?.trim() ?? null,
      signerType:   firmaDeApoderado ? 'GUARDIAN' : 'PATIENT',
      caseType:     rec.caseType,
      lienRequired: requiresLien,
      hasSignature: requiresLien && !!body.signatureSvg,
      ipAddress:    ip,
      token:        token.slice(0, 8) + '…',
    },
  });

  return NextResponse.json({
    ok: true,
    caseCode:    rec.caseCode,
    lienRequired: requiresLien,
    completedAt: new Date().toISOString(),
  });
}
