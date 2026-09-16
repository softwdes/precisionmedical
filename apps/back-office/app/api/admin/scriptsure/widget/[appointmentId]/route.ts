import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import {
  setPracticePrescriber,
  getOrCreateScriptSurePatientId,
  getScriptSureWidgetUrl,
  ScriptSurePatientDataError,
  ScriptSureUserNotFoundError,
  type ScriptSurePatientWidget,
} from '@/lib/scriptsure-client';

const VALID_WIDGETS: ScriptSurePatientWidget[] = [
  'drug-list',
  'pharmacy',
  'allergy',
  'drug-history',
  'medicationdownload',
  'approve-queue',
];

/**
 * GET /api/admin/scriptsure/widget/[appointmentId]?widget=drug-list|pharmacy
 *
 * Arma la URL del widget de ScriptSure para la cita.
 *
 * ── Quién puede abrirlo: lo decide ScriptSure, no nosotros ─────────────────
 *
 * La sesión se abre con la identidad de **quien mira**, y el prescriptor se fija
 * en el **médico de la cita**. Su API separa las dos cosas a propósito
 * (`login/byapp` con el email de la persona + `user/practice/prescriber` con el
 * id del prescriptor), y esa separación es exactamente "enviar EN NOMBRE de".
 *
 * Con eso, lo que cada uno puede hacer sale de su propia cuenta: un Supporting
 * con permisos sobre los providers manda los no controlados en nombre del
 * prescriptor, y los controlados siguen siendo del prescriptor (confirmado por
 * DAW vía Devin, 2026-09-16).
 *
 * **Se quitó el `requireProvider`.** Existía porque antes la sesión se abría con
 * el email del MÉDICO DE LA CITA: dejar entrar a otro era dejarlo firmar con el
 * nombre ajeno. Eso ya no pasa, así que la traba dejó de tener sentido — y
 * mientras existió bloqueaba justo a la gente que DAW dice que sí puede enviar.
 * Queda el guard de siempre: tener acceso a esa cita.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
): Promise<NextResponse> {
  const { appointmentId } = await params;

  const widget = req.nextUrl.searchParams.get('widget') as ScriptSurePatientWidget | null;
  if (!widget || !VALID_WIDGETS.includes(widget)) {
    return NextResponse.json({ error: 'INVALID_WIDGET' }, { status: 400 });
  }

  const access = await checkAppointmentAccess(appointmentId);
  if (access.deny) return access.deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      patient: {
        select: {
          id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          phone: true, phone2: true, scriptsurePatientId: true,
          consentToDrugHistory: true,
        },
      },
      provider: { select: { email: true, scriptsureUserId: true } },
      clinic: { select: { scriptsurePracticeId: true } },
    },
  });
  if (!appt?.patient || !appt.provider || !appt.clinic) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (!appt.provider.scriptsureUserId || !appt.clinic.scriptsurePracticeId) {
    return NextResponse.json({ error: 'NOT_ONBOARDED' }, { status: 409 });
  }
  if (!appt.patient.dateOfBirth) {
    return NextResponse.json({ error: 'PATIENT_MISSING_DOB' }, { status: 422 });
  }

  /**
   * El historial de farmacia sale de Surescripts y trae 12 meses de lo que el
   * paciente retiró en CUALQUIER farmacia: es su medicación con otros médicos.
   * ScriptSure exige su consentimiento y forma parte de la certificación, así
   * que se corta acá y no se manda la consulta.
   *
   * 428 y no 422: no le falta un dato a la ficha del paciente, falta una acción
   * que alguien tiene que hacer. El cliente ofrece registrarlo y reintenta.
   *
   * NO se pide además el NPI del prescriptor, aunque la descarga lo use: el que
   * cuenta es el que ScriptSure tiene en la ficha del Provider (sin NPI no lo
   * habrían dado de alta como prescriptor), y nuestra columna `Provider.npi`
   * está vacía en la mayoría. Cortar por ella bloquearía un flujo que funciona.
   */
  if (widget === 'medicationdownload' && appt.patient.consentToDrugHistory !== true) {
    return NextResponse.json({ error: 'CONSENT_REQUIRED' }, { status: 428 });
  }

  // Quién abre la sesión (la persona real que está mirando) y en nombre de quién
  // se prescribe (el médico de la cita). No son lo mismo, y ahí está la gracia.
  const loginEmail = access.actor.email;
  const practiceId = Number(appt.clinic.scriptsurePracticeId);
  const prescriberId = Number(appt.provider.scriptsureUserId);

  try {
    await setPracticePrescriber(loginEmail, practiceId, prescriberId);

    const scriptsurePatientId = await getOrCreateScriptSurePatientId(loginEmail, practiceId, prescriberId, {
      id: appt.patient.id,
      scriptsurePatientId: appt.patient.scriptsurePatientId,
      firstName: appt.patient.firstName,
      lastName: appt.patient.lastName,
      dob: appt.patient.dateOfBirth,
      sex: appt.patient.sex,
      addressLine1: appt.patient.addressLine1,
      addressCity: appt.patient.addressCity,
      addressState: appt.patient.addressState,
      addressZip: appt.patient.addressZip,
      phone: appt.patient.phone,
      phone2: appt.patient.phone2,
    });

    const url = await getScriptSureWidgetUrl(loginEmail, widget, scriptsurePatientId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof ScriptSurePatientDataError) {
      // El código lo decide el error: si lo único que falta es el teléfono, la
      // pantalla tiene que decir teléfono y no dirección.
      return NextResponse.json({ error: err.code, missingFields: err.missingFields }, { status: 422 });
    }
    /**
     * A esta persona todavía no la dieron de alta en ScriptSure. Es la única
     * traba que queda, y no es de criterio: sin cuenta no hay sesión. Se
     * distingue del error genérico para que la pantalla diga qué hacer.
     */
    if (err instanceof ScriptSureUserNotFoundError) {
      return NextResponse.json(
        { error: 'NO_SCRIPTSURE_USER', loginEmail: err.loginEmail, message: err.detalle },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'SCRIPTSURE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
