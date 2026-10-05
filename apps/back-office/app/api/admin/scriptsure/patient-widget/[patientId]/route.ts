import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientAccess, auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';
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
 * GET /api/admin/scriptsure/patient-widget/[patientId]?widget=drug-list
 *
 * El recetario de un PACIENTE, sin pasar por una visita.
 *
 * Devin (2026-10-05): *"Sometimes medications are sent without visits (great
 * example are these refill requests we received) ... I know Barry specifically
 * but other providers probably as well will occasionally need to prescribe for
 * patients who have not had a visit"*. Una renovación que manda la farmacia no
 * nace de una consulta, y hasta hoy no había dónde atenderla: todo el recetario
 * colgaba de una cita.
 *
 * ── Por qué esta ruta existe aparte y no se generalizó la otra ──────────────
 *
 * La ruta por cita toma `appointmentId` **a propósito**: el cliente nunca
 * nombra a un paciente y el servidor lo deduce de una cita a la que esa persona
 * ya tiene acceso. Eso es una defensa, no una casualidad, y no se toca.
 *
 * Acá el cliente SÍ nombra al paciente, así que el acceso se vuelve a ganar con
 * `checkPatientAccess` —el mismo guard que protege el expediente— y la apertura
 * queda registrada: ver `regla-el-audit-de-divulgacion-va-antes`.
 *
 * ── Quién prescribe ────────────────────────────────────────────────────────
 *
 * Sin cita no hay "médico de la cita", así que **el prescriptor es el provider
 * logueado**, recetando a su propio nombre. Un asistente no pasa: no hay de
 * quién colgar el "en nombre de" y adivinarlo sería poner la firma de alguien
 * que no decidió nada. Si algún día hace falta, se le agrega un selector de
 * provider — nadie lo pidió todavía.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  const { patientId } = await params;

  const widget = req.nextUrl.searchParams.get('widget') as ScriptSurePatientWidget | null;
  if (!widget || !VALID_WIDGETS.includes(widget)) {
    return NextResponse.json({ error: 'INVALID_WIDGET' }, { status: 400 });
  }

  const access = await checkPatientAccess(patientId);
  if (access.deny) return access.deny;

  // Antes de servir nada, no después: en serverless la instancia se congela al
  // responder y un registro diferido se pierde.
  await auditarFichaAjenaDesdeLaPagina(patientId);

  /**
   * Sin cita, el prescriptor es quien mira — y tiene que ser un provider.
   * 403 y no 409: no es que le falte un dato, es que este camino no es para esa
   * persona. La pantalla lo dice en vez de esconder el botón.
   */
  if (!access.actor.providerId) {
    return NextResponse.json({ error: 'NO_PRESCRIBER' }, { status: 403 });
  }

  const [patient, provider] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
        addressLine1: true, addressCity: true, addressState: true, addressZip: true,
        phone: true, phone2: true, scriptsurePatientId: true,
        consentToDrugHistory: true,
      },
    }),
    db.provider.findUnique({
      where: { id: access.actor.providerId },
      select: { scriptsureUserId: true },
    }),
  ]);

  if (!patient) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /**
   * El practice: **las 7 sedes comparten el mismo** (`19096`, medido el
   * 2026-10-05), así que acá no hay nada que elegir y por eso no se le pide a
   * nadie. Se toma el de la sede principal, y si no estuviera, cualquiera que
   * lo tenga — el día que sean distintos esto necesita una decisión, no un
   * default, y conviene que se note.
   */
  const sede = await db.clinic.findFirst({
    where: { scriptsurePracticeId: { not: null } },
    select: { scriptsurePracticeId: true },
    orderBy: { isMainOffice: 'desc' },
  });

  if (!provider?.scriptsureUserId || !sede?.scriptsurePracticeId) {
    return NextResponse.json({ error: 'NOT_ONBOARDED' }, { status: 409 });
  }
  if (!patient.dateOfBirth) {
    return NextResponse.json({ error: 'PATIENT_MISSING_DOB' }, { status: 422 });
  }
  // El historial de farmacia necesita el permiso del paciente, con cita o sin ella.
  if (widget === 'medicationdownload' && patient.consentToDrugHistory !== true) {
    return NextResponse.json({ error: 'CONSENT_REQUIRED' }, { status: 428 });
  }

  const loginEmail = access.actor.email;
  const practiceId = Number(sede.scriptsurePracticeId);
  const prescriberId = Number(provider.scriptsureUserId);

  try {
    await setPracticePrescriber(loginEmail, practiceId, prescriberId);

    const scriptsurePatientId = await getOrCreateScriptSurePatientId(
      loginEmail, practiceId, prescriberId, {
        id: patient.id,
        scriptsurePatientId: patient.scriptsurePatientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dateOfBirth,
        sex: patient.sex,
        addressLine1: patient.addressLine1,
        addressCity: patient.addressCity,
        addressState: patient.addressState,
        addressZip: patient.addressZip,
        phone: patient.phone,
        phone2: patient.phone2,
      });

    const url = await getScriptSureWidgetUrl(loginEmail, widget, scriptsurePatientId);
    return NextResponse.json({ url });
  } catch (err) {
    // Mismos códigos que la ruta por cita: la pantalla ya sabe traducirlos y no
    // tiene por qué enterarse de por cuál de las dos entró.
    if (err instanceof ScriptSurePatientDataError) {
      return NextResponse.json({ error: err.code, missingFields: err.missingFields }, { status: 422 });
    }
    if (err instanceof ScriptSureUserNotFoundError) {
      return NextResponse.json(
        { error: 'NO_SCRIPTSURE_USER', loginEmail: err.loginEmail, message: err.detalle },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'SCRIPTSURE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
