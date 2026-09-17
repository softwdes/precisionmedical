/**
 * F1 — Confirmación de cita · POST de la firma
 *
 * POST /api/confirmar/[token]/sign
 *
 * Es la MISMA firma que captura la tablet del mostrador
 * (`apps/clinical/.../checkin/[appointmentId]/sign`): escribe las mismas tres
 * columnas y usa la misma fórmula de hash, así que un documento firmado por QR
 * y otro firmado en tablet son verificables igual. Dos puertas, un registro.
 *
 * Diferencias con la puerta del staff, a propósito:
 *
 *  · **No exige `CHECKED_IN`.** El paciente firma al llegar, ANTES de que
 *    recepción registre el ingreso — es el orden del v2, donde la página
 *    muestra "Estado del ingreso: Pendiente". La ruta de clinical sí lo exige
 *    porque ahí el staff ya registró la llegada.
 *  · **El token se valida y tiene que estar vigente.** Es la única puerta.
 *
 * El token NO se consume al firmar: la pantalla de "cita confirmada" tiene que
 * poder renderizar. La ventana de exposición no cambia (el token vence igual a
 * las 4 h) y revocarlo antes es poner `signToken` en NULL desde el back-office.
 */

import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, isMinor } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

/**
 * Cada paciente firma UNA vez, pero la IP la comparte con la sala de espera:
 * 30 firmas en 10 minutos es holgado para un mostrador y sigue frenando a un
 * script. Ámbito propio ('confirmar-sign') para que el freno de la página no le
 * gaste el presupuesto a la firma — quedarse sin poder firmar después de haber
 * dibujado es el peor momento para toparse con un 429.
 */
const FRENO_FIRMA = { max: 30, ventanaMs: 10 * 60_000 };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const freno = rateLimit(claveDeIp(req, 'confirmar-sign'), FRENO_FIRMA);
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  const appt = await db.appointment.findUnique({
    where: { signToken: token },
    select: {
      id:                 true,
      status:             true,
      scheduledFor:       true,
      attendanceSignedAt: true,
      signTokenExpiresAt: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true,
          dateOfBirth: true, guardianPatientId: true,
          // El resto es para la FOTO de lo confirmado — ver más abajo.
          patientCode: true, email: true, phone: true, phone2: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          sex: true, maritalStatus: true, race: true, ethnicity: true,
          preferredLanguage: true, communicationPreference: true,
          preferredPharmacy: true, employer: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        },
      },
      case: { select: { id: true, caseCode: true } },
    },
  });

  if (!appt) {
    return NextResponse.json({ ok: false, error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  if (!appt.signTokenExpiresAt || appt.signTokenExpiresAt <= new Date()) {
    return NextResponse.json({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 410 });
  }

  // Idempotente: el paciente puede tocar "Firmar" dos veces, o volver atrás y
  // reenviar. La primera firma es la que vale — no se sobreescribe.
  if (appt.attendanceSignedAt) {
    return NextResponse.json({
      ok:            true,
      alreadySigned: true,
      signedAt:      appt.attendanceSignedAt.toISOString(),
    });
  }

  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return NextResponse.json(
      { ok: false, error: 'APPOINTMENT_NOT_SIGNABLE', status: appt.status },
      { status: 409 },
    );
  }

  const body = await req.json() as { signatureSvg?: string; signerName?: string };

  if (!body.signatureSvg?.trim()) {
    return NextResponse.json({ ok: false, error: 'SIGNATURE_REQUIRED' }, { status: 400 });
  }
  if (!body.signerName?.trim()) {
    return NextResponse.json({ ok: false, error: 'SIGNER_NAME_REQUIRED' }, { status: 400 });
  }

  const signerName = body.signerName.trim();

  // Quién firma se decide con datos de la DB, NO con lo que manda el cliente:
  // si viniera del body, se podría registrar la firma de un menor como propia.
  // Mismo criterio que la firma del lien.
  const firmaDeApoderado = isMinor(appt.patient.dateOfBirth) && !!appt.patient.guardianPatientId;

  const ip        = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  /**
   * La FOTO de lo que el paciente confirmó.
   *
   * El documento dice "revisé la información proporcionada". Hasta acá se
   * guardaba el trazo y su hash, pero no CUÁL era esa información — y desde que
   * el paciente puede corregir su ficha desde la misma pantalla (el botón
   * "Actualizar"), el dato puede haber cambiado minutos antes de la firma y
   * puede volver a cambiar después, desde el back-office.
   *
   * Sin esto, "firmó conforme" no se puede sostener: no queda constancia de con
   * qué estuvo conforme. Se toma del servidor, no de lo que manda el cliente.
   */
  const p = appt.patient;
  const confirmado = {
    patientCode:  p.patientCode,
    nombre:       `${p.firstName} ${p.lastName}`.trim(),
    nacimiento:   p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    email:        p.email,
    telefono:     p.phone,
    movil:        p.phone2,
    direccion:    p.addressLine1,
    ciudad:       p.addressCity,
    estado:       p.addressState,
    zip:          p.addressZip,
    sexo:         p.sex,
    estadoCivil:  p.maritalStatus,
    raza:         p.race,
    etnia:        p.ethnicity,
    idioma:       p.preferredLanguage,
    contactoPref: p.communicationPreference,
    farmacia:     p.preferredPharmacy,
    empleador:    p.employer,
    emergencia1:  { nombre: p.emergencyContactName, telefono: p.emergencyContactPhone, relacion: p.emergencyContactRelation },
    emergencia2:  { nombre: p.emergency2Name,       telefono: p.emergency2Phone,       relacion: p.emergency2Relation },
  };

  const signedAt = new Date();
  const sigHash  = createHash('sha256')
    .update(body.signatureSvg + appt.id + signerName + signedAt.toISOString())
    .digest('hex');

  await db.appointment.update({
    where: { id: appt.id },
    data: {
      attendanceSignedAt:      signedAt,
      attendanceSignatureSvg:  body.signatureSvg,
      attendanceSignatureHash: sigHash,
    },
  });

  await writeAuditLog(db, {
    actorType:   'SYSTEM',
    actorUserId: null,
    // La misma acción que la puerta del staff: quien audite busca una sola cosa.
    action:      'PATIENT_SIGN_ATTENDANCE',
    entityType:  'Appointment',
    entityId:    appt.id,
    metadata: {
      // Lo que separa las dos puertas está acá, no en la acción.
      via:           'PATIENT_QR',
      signerName,
      signerType:    firmaDeApoderado ? 'GUARDIAN' : 'PATIENT',
      signatureHash: sigHash,
      caseCode:      appt.case?.caseCode ?? null,
      patientName:   `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
      scheduledFor:  appt.scheduledFor.toISOString(),
      // El estado ANTES de firmar: deja registrado que se firmó con el ingreso
      // todavía pendiente, que es el flujo esperado.
      statusAlFirmar: appt.status,
      ipAddress:      ip,
      token:          token.slice(0, 8) + '…',
      /** Los datos del paciente tal como estaban en el documento que firmó. */
      confirmado,
    },
  });

  return NextResponse.json({
    ok:            true,
    signedAt:      signedAt.toISOString(),
    signatureHash: sigHash,
  });
}
