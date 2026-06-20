/**
 * B.14.1 — Firma de asistencia · POST
 *
 * POST /api/checkin/[appointmentId]/sign
 *
 * El paciente firma en tablet al llegar a la clínica.
 * Requiere que el appointment esté en CHECKED_IN.
 * Idempotente: si ya firmó, devuelve ok.
 *
 * Body: { signatureSvg: string, signerName: string }
 * Hash: SHA-256(signatureSvg + appointmentId + signerName + timestamp ISO)
 */

import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id:                   true,
      status:               true,
      attendanceSignedAt:   true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      case:    { select: { id: true, caseCode: true } },
    },
  });

  if (!appt) {
    return NextResponse.json({ error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });
  }

  // Idempotente
  if (appt.attendanceSignedAt) {
    return NextResponse.json({ ok: true, alreadySigned: true, signedAt: appt.attendanceSignedAt });
  }

  if (appt.status !== 'CHECKED_IN') {
    return NextResponse.json(
      { error: 'NOT_CHECKED_IN', message: 'El paciente debe hacer check-in antes de firmar.' },
      { status: 409 },
    );
  }

  const body = await req.json() as { signatureSvg?: string; signerName?: string };

  if (!body.signatureSvg?.trim()) {
    return NextResponse.json({ error: 'SIGNATURE_REQUIRED' }, { status: 400 });
  }
  if (!body.signerName?.trim()) {
    return NextResponse.json({ error: 'SIGNER_NAME_REQUIRED' }, { status: 400 });
  }

  const signedAt  = new Date();
  const sigHash   = createHash('sha256')
    .update(body.signatureSvg + appointmentId + body.signerName.trim() + signedAt.toISOString())
    .digest('hex');

  await db.appointment.update({
    where: { id: appointmentId },
    data: {
      attendanceSignedAt:     signedAt,
      attendanceSignatureSvg: body.signatureSvg,
      attendanceSignatureHash: sigHash,
    },
  });

  await writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: null,
    action:      'PATIENT_SIGN_ATTENDANCE',
    entityType:  'Appointment',
    entityId:    appointmentId,
    metadata: {
      signerName:   body.signerName.trim(),
      signatureHash: sigHash,
      caseCode:     appt.case?.caseCode ?? null,
      patientName:  `${appt.patient.firstName} ${appt.patient.lastName}`,
    },
  });

  return NextResponse.json({
    ok:           true,
    signedAt:     signedAt.toISOString(),
    signatureHash: sigHash,
  });
}
