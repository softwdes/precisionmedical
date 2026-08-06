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
import { db, writeAuditLog, isMinor } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({
  via:           z.enum(['SMS', 'EMAIL']).default('SMS'),
  language:      z.enum(['es', 'en']).default('es'),
  customMessage: z.string().max(500).optional(),
  subject:       z.string().max(200).optional(),
  body:          z.string().max(2000).optional(),
});

// El GET y el POST tienen que resolver al destinatario con el mismo select:
// si divergen, el diálogo gatea los canales con una regla y el envío con otra.
const PATIENT_WITH_GUARDIAN_SELECT = {
  id: true, firstName: true, lastName: true, phone: true, email: true, dateOfBirth: true,
  guardianPatient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
} as const;

/**
 * GET — a quién le llegaría el link, sin enviar nada.
 *
 * El diálogo de envío lo consulta al abrir para gatear los canales SMS/Email
 * con los datos del DESTINATARIO real (el tutor cuando el paciente es menor),
 * no con los del paciente. Antes un menor sin correo propio pero con tutor
 * con correo veía el botón Email apagado sin motivo.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: { patient: { select: PATIENT_WITH_GUARDIAN_SELECT } },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const esMenor   = isMinor(caseRecord.patient.dateOfBirth);
  const apoderado = esMenor ? caseRecord.patient.guardianPatient : null;
  const destino   = apoderado ?? caseRecord.patient;

  return NextResponse.json({
    ok: true,
    recipient: {
      firstName:        destino.firstName,
      lastName:         destino.lastName,
      phone:            destino.phone,
      email:            destino.email,
      forGuardian:      !!apoderado,
      guardianRequired: esMenor && !apoderado,
      minorName:        apoderado
        ? `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`.trim()
        : null,
    },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
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

  // Find case + patient (+ apoderado si el paciente es menor)
  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: { patient: { select: PATIENT_WITH_GUARDIAN_SELECT } },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // ─── A quién se le manda ───────────────────────────────────────────────
  // Si el paciente es menor y tiene apoderado vinculado, el link va al
  // apoderado: es quien tiene que llenar el intake y firmar los
  // consentimientos. Mandárselo al menor no serviría legalmente.
  const esMenor    = isMinor(caseRecord.patient.dateOfBirth);
  const apoderado  = esMenor ? caseRecord.patient.guardianPatient : null;
  const destino    = apoderado ?? caseRecord.patient;
  const paraMenor  = !!apoderado;

  // ─── Menor SIN responsable legal: no se envía ──────────────────────────
  // Decisión de negocio (Erick, 2026-08-03): se bloquea. El que firma los
  // consentimientos y el lien es el tutor, así que un intake que llenó y firmó
  // el menor no sirve legalmente. Hasta ahora el link caía al correo del propio
  // menor y nadie se enteraba de que había salido al destinatario equivocado.
  //
  // La vía cuando falta el tutor es la tablet en clínica: `generate-portal-token`
  // (que no manda nada a nadie) sigue funcionando sin esta restricción.
  if (esMenor && !apoderado) {
    const nombreDelMenor = `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`.trim();
    return NextResponse.json({
      error: 'GUARDIAN_REQUIRED',
      message: `${nombreDelMenor} es menor de edad y no tiene responsable legal asignado. `
        + 'Asignalo en la ficha del paciente antes de enviar el formulario — es quien tiene que firmar '
        + 'los consentimientos. Si el paciente ya está en la clínica, se puede llenar en la tablet.',
      patientId: caseRecord.patient.id,
    }, { status: 400 });
  }

  // Validation — contra los datos de quien realmente va a recibir el link
  if (parsed.via === 'SMS' && !destino.phone) {
    return NextResponse.json({
      error: 'NO_PHONE',
      message: paraMenor
        ? 'El apoderado no tiene teléfono registrado'
        : 'Paciente no tiene teléfono registrado',
    }, { status: 400 });
  }
  if (parsed.via === 'EMAIL' && !destino.email) {
    return NextResponse.json({
      error: 'NO_EMAIL',
      message: paraMenor
        ? 'El apoderado no tiene email registrado'
        : 'Paciente no tiene email registrado',
    }, { status: 400 });
  }

  // Generate magic token — CUID-style único por caso
  // Phase 1A: visible en respuesta para testing local
  // Phase 2: hash almacenado + Supabase Auth magic links después de BAA
  const magicToken = `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const expiresIn24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // Phase 1A: localhost · Phase 2: forms.lienmaster.net
  // Ruta /c/[token] = wizard completo (B.5-B.8) · /intake/[token] = legacy 4 pasos
  const portalBase = process.env.PORTAL_URL ?? 'http://localhost:3004';
  const portalUrl = `${portalBase}/c/${magicToken}`;

  // SMS template
  const recipient = parsed.via === 'SMS' ? destino.phone! : destino.email!;
  // Al apoderado se le habla de "tu hijo/a" y se lo nombra: si recibiera el
  // mismo texto que el paciente, no entendería de quién es el caso.
  const nombreMenor = `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`.trim();
  const messageBody = parsed.language === 'es'
    ? paraMenor
      ? `Hola ${destino.firstName}, soy de Precision Medical. Para completar el intake de ${nombreMenor} (caso ${caseRecord.caseCode}), click: ${portalUrl}. Expira en 24h. Dudas: (801) 375-2207.`
      : `Hola ${caseRecord.patient.firstName}, soy de Precision Medical. Para completar tu intake del caso ${caseRecord.caseCode}, click: ${portalUrl}. Expira en 24h. Dudas: (801) 375-2207.`
    : paraMenor
      ? `Hi ${destino.firstName}, this is Precision Medical. To complete the intake for ${nombreMenor} (case ${caseRecord.caseCode}), click: ${portalUrl}. Expires in 24h. Questions: (801) 375-2207.`
      : `Hi ${caseRecord.patient.firstName}, this is Precision Medical. To complete intake for case ${caseRecord.caseCode}, click: ${portalUrl}. Expires in 24h. Questions: (801) 375-2207.`;

  // Si el paciente ya completó el form y se re-envía, limpiar intakeFormCompletedAt
  // para que el portal lo permita llenar de nuevo.
  const isResend = caseRecord.status === 'INTAKE_COMPLETED';

  // Update case — persiste el token en DB para que el portal lo pueda verificar
  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      intakeFormSentAt: new Date(),
      intakeFormSentVia: parsed.via,
      portalToken: magicToken,
      status: (caseRecord.status === 'NEW_REFERRAL' || isResend) ? 'INTAKE_PENDING' : caseRecord.status,
      ...(isResend ? { intakeFormCompletedAt: null } : {}),
    },
  });

  // Audit log con detalles del envío
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
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
