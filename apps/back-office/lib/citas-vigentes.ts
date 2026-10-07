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
 * Estados que ya son un DESENLACE de la visita y no un plan.
 *
 * Una cita en cualquiera de estos no se elimina: se corrige con su propio
 * desenlace. Eliminarla escondería algo que pasó de verdad.
 *
 * `CHECKED_IN` NO está acá, y no por olvido: el paciente que llegó y espera en
 * la sala no tiene todavía ningún desenlace. Igual está protegido —lo frena el
 * `checkedInAt` de más abajo—, pero por esa rama y no por ésta, así el cartel
 * dice "el paciente ya hizo check-in" en vez de "ya tiene un desenlace
 * (atendida, no vino o en consulta)", que de él es falso en las tres.
 *
 * Se vio en pantalla el 23-sep-2026: la regla frenaba bien y el motivo mentía.
 */
const ESTADOS_CON_DESENLACE = new Set([
  'COMPLETED', 'NO_SHOW', 'IN_PROGRESS',
]);

/**
 * ¿Esta visita se CARGÓ A MANO y nunca pasó por la clínica?
 *
 * `COMPLETED` con los tres sellos de reloj en null es la firma exacta de una
 * visita retroactiva: el alta no los inventa a propósito (ver el POST de
 * appointments). Si alguno tiene hora, la visita ocurrió de verdad.
 *
 * Vive acá y se exporta porque la usan DOS reglas distintas —si se puede
 * eliminar y si se puede editar— y la definición tiene que ser una sola. Cada
 * llamador le suma sus propias condiciones: eliminar mira además la penalidad,
 * editar mira además que no haya nota ni cargos.
 */
export function nuncaPasoPorLaClinica(cita: {
  status: string;
  checkedInAt: Date | null;
  admittedAt: Date | null;
  checkedOutAt: Date | null;
}): boolean {
  return cita.status === 'COMPLETED'
    && !cita.checkedInAt && !cita.admittedAt && !cita.checkedOutAt;
}

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
      admittedAt: true,
      checkedOutAt: true,
      attendanceSignedAt: true,
      cancelledSameDay: true,
      visitNote: { select: { id: true } },
    },
  });
  if (!cita) return null; // no existe: que el endpoint responda 404

  /**
   * La visita RETROACTIVA es la excepción, y sin esto quedaba presa.
   *
   * Una visita que ya ocurrió nace `COMPLETED` (ver el POST de appointments),
   * así que caía en el desenlace y NO se podía eliminar nunca. Justo la que más
   * falta hace poder borrar: se carga a mano, a veces meses después, y el
   * dedazo es el motivo por el que existe el botón.
   *
   * Peor todavía, el cartel mandaba a corregirla "desde Admisión" — y una
   * visita retroactiva NUNCA pasa por Admisión: no tiene sellos de reloj. El
   * consejo era un callejón sin salida.
   *
   * `checkedInAt`, `admittedAt` y `checkedOutAt` en null es la firma exacta de
   * "se cargó a mano y nunca pasó por la clínica": el alta retroactiva no los
   * inventa a propósito. Si alguno tiene hora, la visita ocurrió de verdad y
   * sigue protegida.
   *
   * Los demás candados quedan intactos: nota, cargos, cobros y firma se siguen
   * chequeando más abajo. Erick lo encontró el 28-sep-2026 intentando borrar su
   * propia cita de prueba.
   */
  if (ESTADOS_CON_DESENLACE.has(cita.status) && !nuncaPasoPorLaClinica(cita)) return 'ESTADO';
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

/**
 * ¿Se puede EDITAR una cita ya atendida?
 *
 * Por defecto no: una visita atendida es un hecho, y el PATCH solo le deja
 * tocar los cargos. Pero la visita RETROACTIVA **nace** `COMPLETED`, así que
 * nacía inmutable: un dedazo en la sede o en la hora no se podía corregir
 * nunca, ni un segundo después de cargarla.
 *
 * Erick lo encontró el 2026-10-07 cargando a Jenna Schnackenberg en Pleasant
 * Grove cuando era Provo. Es el mismo hueco que tenía el borrado, y se tapa con
 * la misma firma.
 *
 * Se abre solo si la visita no dejó NINGÚN rastro propio: sin sellos de reloj,
 * sin firma de asistencia, sin nota y sin un peso cargado. En cuanto hay
 * cualquiera de esas cosas vuelve a ser inmutable — ahí ya no es una fila mal
 * tipeada, es una consulta que ocurrió.
 */
export async function sePuedeEditarAunqueEsteAtendida(
  appointmentId: string,
): Promise<boolean> {
  const cita = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: {
      status: true,
      checkedInAt: true,
      admittedAt: true,
      checkedOutAt: true,
      attendanceSignedAt: true,
      plannedServiceCodes: true,
      visitNote: { select: { id: true } },
    },
  });
  if (!cita) return false;
  if (!nuncaPasoPorLaClinica(cita)) return false;
  if (cita.attendanceSignedAt) return false;
  if (cita.visitNote) return false;

  // Los cargos PLANEADOS también cuentan: son el trabajo de facturación que
  // alguien ya hizo sobre esta fila.
  const planeados = Array.isArray(cita.plannedServiceCodes)
    ? cita.plannedServiceCodes.length
    : 0;
  if (planeados > 0) return false;

  const [servicios, cobros] = await Promise.all([
    db.appointmentService.count({ where: { appointmentId } }),
    db.appointmentBilling.count({ where: { appointmentId } }),
  ]);
  return servicios === 0 && cobros === 0;
}
