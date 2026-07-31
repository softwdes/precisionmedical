import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { setPracticePrescriber, getOrCreateScriptSurePatientId, getScriptSureWidgetUrl, type ScriptSureWidget } from '@/lib/scriptsure-client';

const VALID_WIDGETS: ScriptSureWidget[] = ['drug-list', 'pharmacy'];

/**
 * GET /api/admin/scriptsure/widget/[appointmentId]?widget=drug-list|pharmacy
 *
 * Arma la URL del widget de ScriptSure para la cita — solo el doctor dueño
 * de la cita (o un admin) puede abrirlo, igual que firmar la nota: la
 * identidad de ScriptSure tiene que ser la del prescriptor real, no de un
 * escriba médico.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
): Promise<NextResponse> {
  const { appointmentId } = await params;

  const access = await checkAppointmentAccess(appointmentId, { requireProvider: true });
  if (access.deny) return access.deny;

  const widget = req.nextUrl.searchParams.get('widget') as ScriptSureWidget | null;
  if (!widget || !VALID_WIDGETS.includes(widget)) {
    return NextResponse.json({ error: 'INVALID_WIDGET' }, { status: 400 });
  }

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      patient: {
        select: {
          id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          phone: true, phone2: true, scriptsurePatientId: true,
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

  const loginEmail = appt.provider.email;
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
    return NextResponse.json({ error: 'SCRIPTSURE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
