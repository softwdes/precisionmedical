/**
 * B.3 — Send portal magic link
 *
 * POST /api/admin/cases/[id]/send-portal-link
 *
 * SMS: envío REAL por Twilio desde el 2026-08-25 (antes era un stub que no
 * mandaba nada aunque la pantalla dijera "Portal enviado"). Sale por
 * `lib/sms.ts` y queda registrado en `message_logs` con su estado.
 *
 * EMAIL: sale por la Email API nativa de Twilio (comms.twilio.com), con las
 * mismas credenciales. ⚠️ Ese producto es "Powered by Twilio SendGrid" y
 * Twilio NO firma BAA para SendGrid, asi que NO puede llevar PHI a pacientes
 * reales hasta contratar un proveedor que si lo cubra. Mientras tanto
 * `EMAIL_TEST_ALLOWLIST` acota los destinos a direcciones de prueba.
 *
 * Flujo:
 * 1. Genera el magic token
 * 2. Actualiza Case.intakeFormSentAt + intakeFormSentVia + portalToken
 * 3. Case.status: NEW_REFERRAL → INTAKE_PENDING
 * 4. Manda el SMS y lo registra
 * 5. Audit log con el RESULTADO (no con la intención)
 *
 * ⚠️ `delivered: true` en la respuesta significa que Twilio lo aceptó, no que
 * el paciente lo recibió. Eso lo confirma /api/twilio/sms-status.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, isMinor } from '@precision-medical/database';
import { sendSms } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import { buildPortalSms, portalEmailHtml } from '@/lib/portal-message';
import { resolveActor } from '@/lib/actor';
import { generarPortalToken } from '@/lib/portal-token';

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
  const magicToken = generarPortalToken();
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
  // El texto vive en lib/portal-message.ts — el mismo que usa la vista previa
  // del diálogo. Estaba duplicado y se desincronizó apenas se tocó uno.
  const messageBody = buildPortalSms({
    lang: parsed.language,
    caseCode: caseRecord.caseCode,
    minorName: paraMenor ? nombreMenor : null,
    portalUrl,
  });

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

  // ─── Envío real ──────────────────────────────────────────────────────────
  //
  // Hasta el 2026-08-25 esto era un stub: escribía el audit log y devolvía
  // `stub: true`. El paciente nunca recibió nada, aunque la pantalla dijera
  // "Portal enviado".
  //
  // El EMAIL sigue sin cablear a propósito: falta confirmar si el BAA cubre
  // SendGrid (producto aparte de Twilio). Mientras tanto no se finge que sale.
  const smsResult = parsed.via === 'SMS'
    ? await sendSms({
        to: destino.phone!,
        body: messageBody,
        patientId: caseRecord.patient.id,
        caseId: caseId,
        sentByUserId: actor.actorUserId,
        sentByName: actor.actorName,
      })
    : null;

  // El correo sale por la Email API nativa de Twilio, con las mismas
  // credenciales. Mientras no haya BAA, `EMAIL_TEST_ALLOWLIST` lo acota a
  // direcciones de prueba: un destino fuera de la lista se rechaza y queda
  // registrado, en vez de escaparse a un paciente real.
  const emailResult = parsed.via === 'EMAIL'
    ? await sendEmail({
        to: destino.email!,
        toName: `${destino.firstName} ${destino.lastName ?? ''}`.trim() || null,
        subject: parsed.language === 'es'
          ? `Complete su formulario de registro · caso ${caseRecord.caseCode}`
          : `Complete your registration form · case ${caseRecord.caseCode}`,
        html: portalEmailHtml(messageBody, portalUrl, parsed.language),
        text: messageBody,
        patientId: caseRecord.patient.id,
        caseId: caseId,
        sentByUserId: actor.actorUserId,
        sentByName: actor.actorName,
      })
    : null;

  const envio   = smsResult ?? emailResult;
  const enviado = envio?.ok ?? false;

  // Audit log con el resultado REAL, no con la intención
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
      via: parsed.via,
      language: parsed.language,
      recipientLast4: recipient.slice(-4), // No PHI completa en log
      // El token queda fuera del log: es la credencial de acceso al portal.
      expiresAt: expiresIn24h.toISOString(),
      caseCode: caseRecord.caseCode,
      previousStatus: caseRecord.status,
      newStatus: updated.status,
      delivered: enviado,
      messageLogId: envio?.messageLogId ?? null,
      providerMessageId: smsResult?.messageSid ?? emailResult?.operationId ?? null,
      sendError: envio?.error ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    case: { id: updated.id, caseCode: updated.caseCode, status: updated.status },
    sent: {
      via: parsed.via,
      to: recipient,
      language: parsed.language,
      magicToken,
      portalUrl,
      messageBody,
      expiresAt: expiresIn24h.toISOString(),
      // Lo que de verdad pasó. `QUEUED` NO es entregado: la confirmación del
      // operador llega después por /api/twilio/sms-status.
      delivered: enviado,
      status: smsResult?.status ?? (emailResult?.ok ? 'queued' : null),
      messageLogId: envio?.messageLogId ?? null,
      error: envio?.error ?? null,
      errorDetail: envio?.errorDetail ?? null,
    },
  });
}
