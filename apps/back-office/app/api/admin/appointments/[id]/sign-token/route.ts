/**
 * POST /api/admin/appointments/[id]/sign-token
 *
 * Emite el link/QR que el paciente escanea al llegar para revisar sus datos y
 * FIRMAR la confirmación de la cita, antes de pasar a triaje. Reemplaza el
 * "QR de cita" del v2.
 *
 * Tres decisiones que no son obvias:
 *
 *  1. **El token vive en la cita, no en el caso.** El documento que se firma es
 *     de ESTA visita: un token por caso serviría para firmar cualquier cita.
 *
 *  2. **Se REUSA mientras siga vivo.** Emitir uno nuevo en cada apertura del
 *     modal parece más limpio, pero rompe el caso real: recepción muestra el QR,
 *     el paciente lo escanea, recepción reabre el modal → el token del paciente
 *     queda huérfano y su firma falla con la página ya abierta. Solo se emite
 *     otro si no hay ninguno o el que había venció.
 *
 *  3. **`crypto.randomBytes`, no `Date.now()+Math.random()`** como
 *     `generate-portal-token`. Esta página muestra la ficha completa (DOB,
 *     dirección, seguros): el token es la única puerta y tiene que ser
 *     imposible de adivinar.
 *
 * Una cita ya firmada devuelve 409: en el panel el botón desaparece y en su
 * lugar queda el impreso (mismo comportamiento que el v2).
 */

import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

/** Ventana de validez del link. El v2 usa 4 h y alcanza: se firma en el mostrador. */
const VALIDEZ_HORAS = 4;

function baseFormsUrl(): string {
  return process.env.PORTAL_URL
    ?? process.env.NEXT_PUBLIC_FORMS_URL
    ?? 'http://localhost:3004';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  const appt = await db.appointment.findUnique({
    where: { id },
    select: {
      id:                 true,
      status:             true,
      scheduledFor:       true,
      attendanceSignedAt: true,
      signToken:          true,
      signTokenExpiresAt: true,
      patient: { select: { firstName: true, lastName: true } },
      case:    { select: { caseCode: true } },
    },
  });

  if (!appt) {
    return NextResponse.json({ ok: false, error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });
  }

  // Ya firmada: no se emite otro link. El panel muestra el impreso, no el QR.
  if (appt.attendanceSignedAt) {
    return NextResponse.json(
      {
        ok:       false,
        error:    'ALREADY_SIGNED',
        signedAt: appt.attendanceSignedAt.toISOString(),
      },
      { status: 409 },
    );
  }

  // Una cita cancelada no se confirma. No-show sí queda fuera por otra razón:
  // el horario se consumió, ya no hay nada que confirmar.
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return NextResponse.json(
      { ok: false, error: 'APPOINTMENT_NOT_SIGNABLE', status: appt.status },
      { status: 409 },
    );
  }

  const ahora = new Date();
  const vigente =
    !!appt.signToken &&
    !!appt.signTokenExpiresAt &&
    appt.signTokenExpiresAt > ahora;

  let token     = appt.signToken!;
  let expiresAt = appt.signTokenExpiresAt!;

  if (!vigente) {
    token     = `st_${randomBytes(24).toString('base64url')}`;
    expiresAt = new Date(ahora.getTime() + VALIDEZ_HORAS * 60 * 60 * 1000);

    await db.appointment.update({
      where: { id },
      data:  { signToken: token, signTokenExpiresAt: expiresAt },
    });

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      'GENERATE_APPOINTMENT_SIGN_TOKEN',
      entityType:  'appointments',
      entityId:    id,
      ipAddress:   actor.ipAddress,
      userAgent:   actor.userAgent,
      metadata: {
        expiresAt:    expiresAt.toISOString(),
        validezHoras: VALIDEZ_HORAS,
        caseCode:     appt.case?.caseCode ?? null,
        patientName:  `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
        scheduledFor: appt.scheduledFor.toISOString(),
      },
    });
  }

  return NextResponse.json({
    ok:        true,
    signUrl:   `${baseFormsUrl()}/confirmar/${token}`,
    expiresAt: expiresAt.toISOString(),
    // Para que el modal muestre "vence en X" sin recalcular la zona horaria.
    validezHoras: VALIDEZ_HORAS,
    reused:       vigente,
  });
}
