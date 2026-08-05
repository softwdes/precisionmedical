import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import {
  setPracticePrescriber,
  getOrCreateScriptSurePatientId,
  getScriptSureWidgetUrl,
  addToMedCart,
  ScriptSurePatientDataError,
} from '@/lib/scriptsure-client';

/**
 * POST /api/admin/scriptsure/refill/[prescriptionId]
 *
 * "Repetir receta": pre-carga el medicamento en el carrito de ScriptSure y
 * devuelve la URL del widget ya cargado. El doctor revisa, ajusta y envía —
 * nosotros nunca enviamos una receta por nuestra cuenta.
 *
 * Sirve para cualquier receta del historial, no solo las que fallaron: repetir
 * algo que el paciente ya usó es el caso más común.
 *
 * Si ScriptSure rechaza el carrito, se devuelve su respuesta cruda y queda en
 * auditoría: el esquema exacto no está documentado y se ajusta con el primer
 * intento real.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ prescriptionId: string }> },
): Promise<NextResponse> {
  const { prescriptionId } = await params;

  const rx = await db.prescription.findUnique({
    where: { id: prescriptionId },
    select: {
      id: true, appointmentId: true, drugName: true, dose: true, frequency: true,
      quantityTotal: true, refills: true, durationStr: true,
      ndc: true, rxNorm: true, routedMedId: true, gcnSeqno: true, scriptsureDrugId: true,
      pharmacyId: true, quantityQualifier: true,
    },
  });
  if (!rx) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Mismo permiso que abrir el widget: el doctor de la cita (o un admin)
  const access = await checkAppointmentAccess(rx.appointmentId, { requireProvider: true });
  if (access.deny) return access.deny;

  const appt = await db.appointment.findUnique({
    where: { id: rx.appointmentId },
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

  // Sin los identificadores del fármaco, el carrito no puede resolverlo. Pasa
  // con las recetas anteriores a que empezáramos a guardarlos.
  if (!rx.routedMedId && !rx.gcnSeqno && !rx.ndc) {
    return NextResponse.json({ error: 'MISSING_DRUG_IDS' }, { status: 422 });
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

    const days = parseInt(rx.durationStr.replace(/[^0-9]/g, ''), 10);

    const cart = await addToMedCart(loginEmail, scriptsurePatientId, {
      drugName: rx.drugName,
      routedMedId: rx.routedMedId,
      gcnSeqno: rx.gcnSeqno,
      ndc: rx.ndc,
      rxNorm: rx.rxNorm,
      scriptsureDrugId: rx.scriptsureDrugId,
      pharmacyId: rx.pharmacyId,
      quantityQualifier: rx.quantityQualifier,
      quantity: rx.quantityTotal,
      refills: rx.refills,
      sig: rx.frequency !== '—' ? rx.frequency : null,
      daysSupply: Number.isNaN(days) ? null : days,
    }, { practiceId, doctorId: prescriberId });

    writeAuditLog(db, {
      ...actorFromHeaders(req.headers),
      action: 'SCRIPTSURE_REFILL',
      entityType: 'prescriptions',
      entityId: rx.id,
      metadata: JSON.parse(JSON.stringify({
        drugName: rx.drugName,
        ok: cart.ok,
        step: cart.step,
        status: cart.status,
        raw: cart.raw,
        clear: cart.clear ?? null,
      })) as Record<string, string>,
    }).catch(() => undefined);

    if (!cart.ok) {
      return NextResponse.json(
        { error: 'MEDCART_FAILED', step: cart.step, status: cart.status, raw: cart.raw },
        { status: 502 },
      );
    }

    // El carrito ya tiene el medicamento: se abre para revisar y enviar
    const url = await getScriptSureWidgetUrl(loginEmail, 'medcart', scriptsurePatientId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof ScriptSurePatientDataError) {
      return NextResponse.json(
        { error: 'PATIENT_MISSING_ADDRESS', missingFields: err.missingFields },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: 'SCRIPTSURE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
