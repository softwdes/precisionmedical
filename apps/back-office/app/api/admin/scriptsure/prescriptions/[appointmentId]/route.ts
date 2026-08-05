import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';

/**
 * GET /api/admin/scriptsure/prescriptions/[appointmentId]
 *
 * Recetas electrónicas de la cita (modelo Prescription — las llena el webhook
 * de ScriptSure cuando el doctor envía a la farmacia). El tab Prescription las
 * refresca al cerrar el modal del widget: pull atado a acción del usuario,
 * nunca polling (regla de uso de DAW).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
): Promise<NextResponse> {
  const { appointmentId } = await params;

  const access = await checkAppointmentAccess(appointmentId);
  if (access.deny) return access.deny;

  const rows = await db.prescription.findMany({
    where: { appointmentId },
    orderBy: { createdAt: 'desc' },
    select: {
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
    },
  });

  const prescriptions = rows.map(({ routedMedId, gcnSeqno, ndc, ...rx }) => ({
    ...rx,
    canRefill: !!(routedMedId || gcnSeqno || ndc),
  }));

  return NextResponse.json({ prescriptions });
}
