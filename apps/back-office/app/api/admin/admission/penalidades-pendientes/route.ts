/**
 * GET /api/admin/admission/penalidades-pendientes?dias=30
 *
 * Los desenlaces que CONSUMIERON el horario y siguen sin su cargo, a través de
 * los días — no del día que se está mirando.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * La pantalla de Admisión es de UN día. La sección "Sin penalidad" también, y
 * eso la vuelve inútil para lo único que representa: trabajo sin hacer. Un
 * no-show del martes pasado sin su cargo sigue debiéndose hoy, y hoy no se ve.
 *
 * Medido el 2026-09-23 contra la base real: en cuatro días sueltos había **9
 * desenlaces cobrables y ninguno con su cargo**, el más viejo del 27 de agosto.
 * Un mes sin cobrarse. No es que nadie los encuentre por descuido: no había
 * ninguna pantalla donde pudieran verse juntos.
 *
 * ── Por qué una ruta propia y no un parámetro de `admission` ───────────────
 *
 * `APPT_INCLUDE` y `mapAppt` viven en `admission/route.ts` sin exportarse, y ese
 * archivo estaba en la tanda sin commitear de otra sesión cuando se escribió
 * esto. Exportar algo de un archivo ajeno a medio commitear es la forma más
 * rápida de que a esa sesión se le mezcle el diff.
 *
 * Y resulta que separarlo es mejor igual: esta lista no necesita nada de lo que
 * la cola del día sí —la foto del paciente, el QR, el check-in—. Es un pendiente
 * con su fecha, no una fila de la agenda. La forma liviana es la correcta.
 *
 * ── La ventana ─────────────────────────────────────────────────────────────
 *
 * 30 días por defecto. No es un número redondo elegido a ojo: con 5 días —que
 * fue la primera idea— las 5 penalidades del 27 de agosto quedaban afuera, que
 * es exactamente la queja que vino a resolver esto. Y sin ventana la lista
 * crecería para siempre, porque **no se vacía sola**: se vacía cuando alguien
 * cobra, y hasta hoy nadie cobró ninguna.
 *
 * Por eso además se devuelve `masViejas`: lo que queda fuera de la ventana se
 * CUENTA y se dice. Nada desaparece en silencio — esa lección salió cara con
 * una fila que se fue de la pantalla de Edson y nadie supo por qué.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, VIGENTES } from '@precision-medical/database';
import { claveDia } from '@/lib/fechas';

/** Tope de días hacia atrás que se aceptan. Lo de más ya no se cobra. */
const DIAS_VALIDOS = [7, 15, 30, 60, 90];
const DIAS_POR_DEFECTO = 30;

/** Una penalidad pendiente, con lo justo para listarla y poder asentarla. */
export interface PenalidadPendiente {
  id: string;
  scheduledFor: string;
  /** Clave `YYYY-MM-DD` en hora de la clínica — con esto agrupa la pantalla. */
  dia: string;
  status: string;
  cancelledSameDay: boolean;
  patient: { id: string; firstName: string; lastName: string };
  clinic: { id: string; name: string } | null;
  case: { id: string; caseCode: string; caseType: string } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const crudo = Number(req.nextUrl.searchParams.get('dias'));
  const dias = DIAS_VALIDOS.includes(crudo) ? crudo : DIAS_POR_DEFECTO;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  desde.setHours(0, 0, 0, 0);

  /*
   * El MISMO criterio de "consumió el horario" que usa la pantalla del día: el
   * que no vino, y el que canceló el mismo día. La cancelación CON AVISO liberó
   * la agenda y no debe nada — si entrara acá, la lista pediría cobrar algo que
   * no corresponde.
   *
   * `scheduledFor` en el pasado, no en la ventana a secas: una cita de mañana
   * marcada no-show por error no es una deuda, es un error que se corrige.
   */
  const where = {
    ...VIGENTES,
    scheduledFor: { gte: desde, lte: new Date() },
    OR: [
      { status: 'NO_SHOW' as const },
      { status: 'CANCELLED' as const, cancelledSameDay: true },
    ],
  };

  const [candidatos, masViejasTotal] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: { scheduledFor: 'desc' },
      select: {
        id: true, scheduledFor: true, status: true, cancelledSameDay: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        clinic:  { select: { id: true, name: true } },
        case:    { select: { id: true, caseCode: true, caseType: true } },
      },
    }),
    /*
     * Las de ANTES de la ventana, solo para decir cuántas son. Se cuentan todas
     * las cobrables y después se descuentan las que ya tienen cargo — contar
     * "sin cargo" en la base pediría un LEFT JOIN por fila y esto es un número
     * al pie, no una lista.
     */
    db.appointment.count({
      where: {
        ...VIGENTES,
        scheduledFor: { lt: desde },
        OR: [
          { status: 'NO_SHOW' as const },
          { status: 'CANCELLED' as const, cancelledSameDay: true },
        ],
      },
    }),
  ]);

  // Lo facturado de todas, en UNA consulta. Sin esto habría una por fila.
  const conCargo = candidatos.length
    ? new Set(
        (await db.appointmentBilling.groupBy({
          by:    ['appointmentId'],
          where: { appointmentId: { in: candidatos.map(a => a.id) } },
        })).map(g => g.appointmentId),
      )
    : new Set<string>();

  const items: PenalidadPendiente[] = candidatos
    .filter(a => !conCargo.has(a.id))
    .map(a => ({
      id:               a.id,
      scheduledFor:     a.scheduledFor.toISOString(),
      dia:              claveDia(a.scheduledFor),
      status:           a.status,
      cancelledSameDay: a.cancelledSameDay === true,
      patient:          a.patient,
      clinic:           a.clinic,
      case:             a.case,
    }));

  return NextResponse.json({
    ok: true,
    dias,
    items,
    /*
     * Aproximado hacia arriba a propósito: acá no se descuentan las que ya
     * tienen cargo, así que el número puede ser mayor que las que realmente
     * faltan. Es un "hay más atrás, mirá", no un saldo. Si algún día se muestra
     * como cifra de dinero, hay que calcularlo bien.
     */
    masViejas: masViejasTotal,
  });
}
