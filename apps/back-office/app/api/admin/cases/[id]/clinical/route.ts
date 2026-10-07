import { NextResponse, type NextRequest } from 'next/server';
import { db, VIGENTES } from '@precision-medical/database';
import { COVERAGE_LIST_SELECT, resolveCoverage, serializeCoverage } from '@/lib/coverage';
import { conDetalleDeReceta } from '@/lib/medication-details';

/**
 * GET /api/admin/cases/[id]/clinical
 *
 * Lo clínico REAL del caso, agrupado por visita: recetas electrónicas
 * (ScriptSure), órdenes de laboratorio con resultados, nota del doctor,
 * servicios de los DOS catálogos (CPT a seguro + cash) y férulas.
 *
 * Existe porque el tab del caso leía el JSON `medicalHistory` (captura manual
 * Fase 1) mientras el doctor trabaja contra estas tablas — dos verdades: una
 * receta enviada hoy no aparecía en el caso. Lo consumen los tabs
 * "Prescripciones y Labs" y "Tratamiento" del detalle de caso.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Conciliación de medicamentos — es del PACIENTE (medicalHistory JSON), no de
  // una visita: el tab Prescription del caso la muestra igual que la consulta.
  const caseRow = await db.case.findUnique({
    where: { id },
    // Cobertura: el picker de cargos la usa para ordenar los catálogos
    // (INSURANCE primero si hay seguro) — misma regla que Day Admission.
    select: { patient: { select: { id: true, medicalHistory: true } }, ...COVERAGE_LIST_SELECT },
  });
  if (!caseRow) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  const mh = (caseRow.patient.medicalHistory ?? {}) as {
    medications?: Array<{
      id?: string; name: string; dose?: string; instructions?: string; status: string;
      prescribedBy?: string; externalPrescriber?: boolean;
    }>;
  };

  const appts = await db.appointment.findMany({
    /**
     * Entran las que NO OCURRIERON pero igual se cobran.
     *
     * La regla de penalidades (Erick, 20-ago-2026) dice que un no-show y una
     * cancelación del MISMO DÍA consumen el horario y se cobran — con sus
     * palabras: *"se muestra el caso para generarle un cobro de penalidad"*.
     * Esta consulta es del 9-ago, ONCE DÍAS ANTERIOR a esa regla, y nunca se
     * actualizó: escondía justamente la visita donde hay que colgar el cargo.
     *
     * Cobranza quedó sin camino. Medido el 2-oct-2026: **43 no-shows y 8
     * cancelaciones del mismo día sin un solo cargo**, 51 de ellas en los
     * últimos 90 días. A $100 el código de no-show son ~$5.100 que la regla
     * manda cobrar y la pantalla no dejaba.
     *
     * La cancelación CON AVISO sigue afuera **mientras esté limpia**: esa no se
     * cobra y no da acceso al caso, por la misma regla.
     *
     * Pero si ya tiene PLATA encima, entra. La premisa de dejarla afuera es
     * "esta visita no se cobra", y una fila que ya tiene cargos, servicios o un
     * cobro la desmiente por sí sola. Sin esto quedaba encerrada por los cuatro
     * lados: no aparece en Servicios, reabrirla responde `HAS_CHARGES` y
     * borrarla responde `CARGOS`. No había ningún camino.
     *
     * Lo destapó Darrell el 2026-10-07 con Scott Shurtleff (13-may, $151,26 sin
     * cobrar): *"was cancelled but pt was seen. I cannot open it to make
     * payments"*. Medido ese día: **51 canceladas con aviso con fila de cobro y
     * $11.129,11 pendientes** que el mostrador no podía cobrar por pantalla. Casi
     * todas vienen del v2, donde la visita ocurrió y acá llegó como cancelada.
     *
     * ⚠️ Que la visita VENGA no significa que acepte de todo: una consulta que
     * no ocurrió no puede recibir una nota, una receta, un lab ni una férula.
     * Eso lo decide `visitaDestino` en `case-clinical-tabs.tsx`, que es quien
     * elige a qué visita va lo nuevo.
     */
    where: {
      ...VIGENTES,
      caseId: id,
      OR: [
        { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        { status: 'NO_SHOW' },
        { status: 'CANCELLED', cancelledSameDay: true },
        // Cancelada con aviso pero con plata encima. Las tres formas que puede
        // tomar un cargo: las líneas planeadas del JSON, los servicios en efectivo
        // y la fila de facturación.
        {
          status: 'CANCELLED',
          OR: [
            { NOT: { plannedServiceCodes: { equals: [] } } },
            { cashServices: { some: {} } },
            { billing:      { some: {} } },
          ],
        },
      ],
    },
    orderBy: { scheduledFor: 'desc' },
    select: {
      id: true,
      scheduledFor: true,
      status: true,
      cancelledSameDay: true,
      plannedServiceCodes: true,
      provider: { select: { id: true, firstName: true, lastName: true } },
      visitNote: {
        select: {
          status: true, signedAt: true, signedByName: true,
          diagnoses: {
            orderBy: { sortOrder: 'asc' },
            select: { icd10Code: true, icd10Label: true, snomedLabel: true },
          },
        },
      },
      prescriptions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, drugName: true, deaSchedule: true, dose: true, frequency: true,
          quantityTotal: true, refills: true, pharmacyName: true, status: true,
          dawSentAt: true, createdAt: true,
          // El acuse de la farmacia, igual que en el endpoint por cita: las dos
          // pantallas muestran el mismo sello y tienen que leer el mismo dato.
          pharmacyAckAt: true, pharmacyAckText: true,
          // Solo para derivar canRefill — el carrito de ScriptSure identifica el
          // fármaco por estos ids (misma regla que el endpoint por cita)
          routedMedId: true, gcnSeqno: true, ndc: true,
        },
      },
      labOrders: {
        orderBy: { orderedAt: 'desc' },
        select: {
          id: true, groupId: true, orderType: true, studyName: true, studyCode: true,
          clinicalIndication: true, urgency: true, billingType: true,
          collectionSite: true, preferredCenter: true, icd10Codes: true,
          status: true, orderedAt: true, orderedByName: true,
          resultFileName: true, resultUploadedAt: true, resultUploadedByName: true,
        },
      },
      braces: {
        orderBy: { dispensedAt: 'desc' },
        select: {
          id: true, code: true, name: true, sizeLabel: true, unitPrice: true,
          side: true, quantity: true, status: true,
        },
      },
      cashServices: {
        // Ascendente, igual que /api/admin/cash-services/[appointmentId]: con la
        // hora a la vista, el orden de cobro tiene que leerse hacia adelante.
        orderBy: { chargedAt: 'asc' },
        select: {
          id: true, code: true, name: true, unitPrice: true, unitLabel: true,
          // `catalogItemId` para marcar en el catálogo lo que ya se cargó;
          // `chargedAt` para distinguir dos cobros idénticos en la lista
          quantity: true, status: true, catalogItemId: true, chargedAt: true,
        },
      },
    },
  });

  const visits = appts.map((a) => ({
    appointmentId: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    status: a.status,
    /** Para distinguir la cancelación que se cobra de la que no. */
    cancelledSameDay: a.cancelledSameDay ?? false,
    providerName: a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : null,
    /** Para preseleccionar al solicitante de una orden nueva */
    providerId: a.provider?.id ?? null,
    note: a.visitNote
      ? {
          status: a.visitNote.status,
          signedAt: a.visitNote.signedAt?.toISOString() ?? null,
          signedByName: a.visitNote.signedByName,
          diagnoses: a.visitNote.diagnoses,
        }
      : null,
    prescriptions: a.prescriptions.map(({ routedMedId, gcnSeqno, ndc, ...rx }) => ({
      ...rx,
      dawSentAt: rx.dawSentAt?.toISOString() ?? null,
      createdAt: rx.createdAt.toISOString(),
      canRefill: !!(routedMedId || gcnSeqno || ndc),
    })),
    labOrders: a.labOrders.map((l) => ({
      ...l,
      orderedAt: l.orderedAt.toISOString(),
      resultUploadedAt: l.resultUploadedAt?.toISOString() ?? null,
    })),
    // CPT a seguro — snapshot JSON de la cita (misma fuente que el Resumen)
    // `category` va tal cual: el PATCH de la cita lo exige al reescribir la
    // lista, así que perderlo acá rompía agregar/quitar cargos.
    services: ((a.plannedServiceCodes ?? []) as Array<{ id: string; code: string; description: string; fee?: number; category: string }>),
    braces: a.braces
      .filter((b) => b.status === 'DISPENSED')
      .map((b) => ({ ...b, unitPrice: Number(b.unitPrice) })),
    cashServices: a.cashServices
      .filter((c) => c.status === 'CHARGED')
      .map((c) => ({ ...c, unitPrice: Number(c.unitPrice), chargedAt: c.chargedAt.toISOString() })),
  }));

  // La visita "actual" para acciones post-visita (nueva orden, nueva receta,
  // conciliación): la más reciente que YA OCURRIÓ. Una recita futura agendada
  // no debe recibir órdenes de hoy.
  const now = new Date();
  const latestPast = appts.find((a) => a.scheduledFor <= now) ?? appts[appts.length - 1];

  return NextResponse.json({
    visits,
    // Con la dosis, el sig, la cantidad, la farmacia y el estado del envío
    // pegados — mismo helper que la consulta, para que el caso no muestre
    // menos que el portal del provider por leer de otra ruta.
    medications: await conDetalleDeReceta(caseRow.patient.id, mh.medications),
    latestAppointmentId: latestPast?.id ?? null,
    coverage: serializeCoverage(resolveCoverage(caseRow)),
  });
}
