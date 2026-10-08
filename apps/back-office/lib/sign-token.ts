/**
 * La emisión del link que el paciente firma al llegar.
 *
 * Vive acá y no dentro de la ruta porque ahora hay DOS puertas al mismo token:
 * el modal del QR lo pide para dibujarlo, y el envío por SMS/correo lo pide
 * para pegarlo en el mensaje. Con la lógica duplicada, el día que cambie la
 * ventana de validez una de las dos se queda con el valor viejo y nadie se
 * entera hasta que un paciente abre un link muerto.
 */

import { randomBytes } from 'crypto';
import { db, writeAuditLog } from '@precision-medical/database';

/** Ventana de validez del link. El v2 usa 4 h y alcanza: se firma en el mostrador. */
export const VALIDEZ_HORAS = 4;

export function baseFormsUrl(): string {
  return process.env.PORTAL_URL
    ?? process.env.NEXT_PUBLIC_FORMS_URL
    ?? 'http://localhost:3004';
}

export type MotivoSinToken = 'APPOINTMENT_NOT_FOUND' | 'ALREADY_SIGNED' | 'APPOINTMENT_NOT_SIGNABLE';

export interface TokenDeFirma {
  signUrl: string;
  expiresAt: Date;
  /** `true` si se reuso uno que ya existia; el que mira calcula cuanto le queda. */
  reused: boolean;
  patientName: string;
  caseCode: string | null;
  scheduledFor: Date;
}

/**
 * El actor, con la forma EXACTA que pide el audit.
 *
 * Se deriva de `writeAuditLog` en vez de escribirla a mano: `actorRole` es un
 * enum, y declararlo `string` compilaba acá y fallaba al pasarlo.
 */
export type ActorDelToken = Pick<
  Parameters<typeof writeAuditLog>[1],
  'actorType' | 'actorUserId' | 'actorRole' | 'ipAddress' | 'userAgent'
>;

/**
 * Emite el token, o devuelve POR QUÉ no se puede.
 *
 * Se REUSA mientras siga vivo: emitir uno nuevo en cada apertura deja huérfano
 * el que el paciente ya tiene abierto en el teléfono y su firma falla con la
 * página delante. Solo se emite otro si no hay ninguno o el que había venció.
 */
export async function emitirTokenDeFirma(
  appointmentId: string,
  actor: ActorDelToken,
): Promise<{ ok: true; token: TokenDeFirma } | { ok: false; motivo: MotivoSinToken; status?: string; signedAt?: Date }> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, status: true, scheduledFor: true, attendanceSignedAt: true,
      signToken: true, signTokenExpiresAt: true,
      patient: { select: { firstName: true, lastName: true } },
      case:    { select: { caseCode: true } },
    },
  });

  if (!appt) return { ok: false, motivo: 'APPOINTMENT_NOT_FOUND' };
  if (appt.attendanceSignedAt) {
    return { ok: false, motivo: 'ALREADY_SIGNED', signedAt: appt.attendanceSignedAt };
  }
  // Una cita cancelada no se confirma. No-show queda fuera por otra razón: el
  // horario se consumió, ya no hay nada que confirmar.
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return { ok: false, motivo: 'APPOINTMENT_NOT_SIGNABLE', status: appt.status };
  }

  const ahora = new Date();
  const vigente = !!appt.signToken && !!appt.signTokenExpiresAt && appt.signTokenExpiresAt > ahora;

  let token     = appt.signToken!;
  let expiresAt = appt.signTokenExpiresAt!;

  if (!vigente) {
    // `crypto.randomBytes` y no `Date.now()+Math.random()`: esta pagina muestra
    // la ficha completa (DOB, direccion, seguros). El token es la unica puerta.
    token     = `st_${randomBytes(24).toString('base64url')}`;
    expiresAt = new Date(ahora.getTime() + VALIDEZ_HORAS * 60 * 60 * 1000);

    await db.appointment.update({
      where: { id: appointmentId },
      data:  { signToken: token, signTokenExpiresAt: expiresAt },
    });

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      'GENERATE_APPOINTMENT_SIGN_TOKEN',
      entityType:  'appointments',
      entityId:    appointmentId,
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

  return {
    ok: true,
    token: {
      signUrl:      `${baseFormsUrl()}/confirmar/${token}`,
      expiresAt,
      reused:       vigente,
      patientName:  `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
      caseCode:     appt.case?.caseCode ?? null,
      scheduledFor: appt.scheduledFor,
    },
  };
}
