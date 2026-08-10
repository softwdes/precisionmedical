import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';

const RX_SELECT = {
  id: true,
  drugName: true,
  deaSchedule: true,
  dose: true,
  frequency: true,
  quantityTotal: true,
  refills: true,
  pharmacyName: true,
  status: true,
  dawSentAt: true,
  createdAt: true,
  // Solo para saber si se puede repetir — el carrito de ScriptSure resuelve
  // el fármaco por estos ids, no por nombre. Las recetas anteriores a que
  // empezáramos a guardarlos no se pueden repetir.
  routedMedId: true,
  gcnSeqno: true,
  ndc: true,
} as const;

type RxRow = { routedMedId: string | null; gcnSeqno: string | null; ndc: string | null };
const conRefill = <T extends RxRow>({ routedMedId, gcnSeqno, ndc, ...rx }: T): Omit<T, keyof RxRow> & { canRefill: boolean } => ({
  ...rx,
  canRefill: !!(routedMedId || gcnSeqno || ndc),
});

/**
 * GET /api/admin/scriptsure/prescriptions/[appointmentId]
 *
 * Recetas electrónicas de la cita (modelo Prescription — las llena el webhook
 * de ScriptSure cuando el doctor envía a la farmacia). El tab Prescription las
 * refresca al cerrar el modal del widget: pull atado a acción del usuario,
 * nunca polling (regla de uso de DAW).
 *
 * Devuelve además `previous`: lo que ya se le envió al paciente en OTRAS citas.
 * Sin eso, el doctor que atiende una consulta nueva no puede repetir la receta
 * del mes pasado — que es justo el caso que dispara la vuelta del paciente (la
 * farmacia no tenía las pastillas). Ahí solo van las que llegaron a la farmacia:
 * repetir una que falló no tiene sentido, se reenvía la buena.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
): Promise<NextResponse> {
  const { appointmentId } = await params;

  const access = await checkAppointmentAccess(appointmentId);
  if (access.deny) return access.deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true },
  });

  const [rows, prevRows] = await Promise.all([
    db.prescription.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
      select: RX_SELECT,
    }),
    appt
      ? db.prescription.findMany({
        where: {
          appointmentId: { not: appointmentId },
          appointment: { patientId: appt.patientId },
          status: { in: ['SENT', 'PENDING_DAW'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { ...RX_SELECT, appointment: { select: { scheduledFor: true } } },
      })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    prescriptions: rows.map(conRefill),
    previous: prevRows.map(({ appointment, ...rx }) => ({
      ...conRefill(rx),
      visitDate: appointment.scheduledFor.toISOString(),
    })),
  });
}
