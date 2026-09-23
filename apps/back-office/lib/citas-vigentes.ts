import { db } from '@precision-medical/database';

/**
 * La REGLA de qué cita se puede eliminar, y de qué no.
 *
 * El FILTRO en sí (`VIGENTES` / `ELIMINADAS`) vive en el paquete de base y no
 * acá: lo necesitan las cuatro apps que listan citas, y si viviera en
 * `apps/back-office/lib` las otras tres tendrían que escribirlo a mano. Se
 * reexporta desde este módulo para que el código del back-office tenga un solo
 * lugar del que importar todo lo de citas eliminadas.
 */
export { VIGENTES, ELIMINADAS } from '@precision-medical/database';

/**
 * Estados que ya son un HECHO de la visita y no un plan.
 *
 * Una cita en cualquiera de estos no se elimina: se corrige con su propio
 * desenlace. Eliminarla escondería algo que pasó de verdad.
 */
const ESTADOS_CON_HISTORIA = new Set([
  'COMPLETED', 'NO_SHOW', 'CHECKED_IN', 'IN_PROGRESS',
]);

export type MotivoNoEliminable =
  | 'CARGOS'          // tiene servicios o cobros
  | 'NOTA'            // tiene nota de visita
  | 'LLEGO'           // hizo check-in
  | 'FIRMO'           // firmó la confirmación de asistencia
  | 'ESTADO'          // atendida / no-show / en consulta
  | 'PENALIDAD';      // cancelada el mismo día: hay penalidad en juego

/**
 * ¿Esta cita se puede eliminar, o hay que cancelarla?
 *
 * ── La línea que esto defiende ───────────────────────────────────────────────
 *
 * **Cancelar** significa *el paciente no viene*: es un hecho clínico y de
 * facturación, puede llevar penalidad y alimenta las estadísticas.
 * **Eliminar** significa *este registro nunca debió existir*: una prueba, un
 * duplicado, el paciente equivocado.
 *
 * Si eliminar fuera libre, sería el atajo cómodo para deshacer un no-show —y la
 * clínica perdería justo el historial con el que cobra las penalidades—. Por eso
 * la cita con RASTRO no se elimina.
 *
 * Es el mismo criterio con el que ya se bloquea reabrir una cita con cargos
 * ("quitalos primero desde Servicios"): la plata y los hechos físicos se
 * deshacen donde se sellaron, no escondiendo la fila.
 *
 * Devuelve `null` si se puede eliminar, o el motivo por el que no.
 */
export async function porQueNoSePuedeEliminar(
  appointmentId: string,
): Promise<MotivoNoEliminable | null> {
  const cita = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: {
      status: true,
      checkedInAt: true,
      attendanceSignedAt: true,
      cancelledSameDay: true,
      visitNote: { select: { id: true } },
    },
  });
  if (!cita) return null; // no existe: que el endpoint responda 404

  if (ESTADOS_CON_HISTORIA.has(cita.status)) return 'ESTADO';
  // La cancelación del MISMO DÍA conserva servicios y admite penalidad: es
  // plata en juego, no un registro sobrante (ver `cancelledSameDay`).
  if (cita.cancelledSameDay)      return 'PENALIDAD';
  if (cita.checkedInAt)           return 'LLEGO';
  if (cita.attendanceSignedAt)    return 'FIRMO';
  if (cita.visitNote)             return 'NOTA';

  const [servicios, cobros] = await Promise.all([
    db.appointmentService.count({ where: { appointmentId } }),
    db.appointmentBilling.count({ where: { appointmentId } }),
  ]);
  if (servicios > 0 || cobros > 0) return 'CARGOS';

  return null;
}
