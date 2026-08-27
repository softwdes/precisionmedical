/**
 * Desenlace de una cita: qué consumió el horario y qué admite cobro.
 *
 * Módulo deliberadamente SIN dependencias (ni Prisma ni React) porque lo usan
 * las dos orillas: las rutas de API y los componentes cliente.
 *
 * El eje NO es "ocurrió o no ocurrió", es **si el horario se consumió**:
 *
 * | Estado                          | ¿Libera la agenda? | ¿Cobra? |
 * |---------------------------------|--------------------|---------|
 * | `NO_SHOW`                       | No                 | Sí      |
 * | `CANCELLED` + `cancelledSameDay`| No (ya se perdió)  | Sí      |
 * | `CANCELLED` con aviso           | Sí                 | No      |
 *
 * En palabras de Erick: *"el doctor esperaba su turno y nunca apareció... siempre
 * lo tuvo, y por ello se muestra el caso para generarle un cobro de penalidad"*.
 */

export interface AppointmentOutcome {
  status: string;
  /** Cancelación tardía: intención de recepción, no un cálculo de fechas. */
  cancelledSameDay?: boolean;
}

/**
 * La cita consumió el horario del doctor sin atenderse, así que admite penalidad:
 * no-show, o cancelación del MISMO DÍA. La cancelación con aviso liberó la agenda
 * y no cobra nada.
 *
 * Vive acá y no repetida en cada pantalla porque la comparación ya estaba suelta
 * en varios lugares (el gate del caso en el panel de la cita, la leyenda del
 * calendario, los contadores) y cada copia es una oportunidad de que se separen.
 */
export function esDesenlaceCobrable(appt: AppointmentOutcome): boolean {
  return appt.status === 'NO_SHOW' || (appt.status === 'CANCELLED' && appt.cancelledSameDay === true);
}

/** Servicio ya cargado a la cita (una línea de `plannedServiceCodes`). */
export interface ChargedService {
  fee?: number | null;
}

/**
 * Suma de lo cargado a la cita. Es lo que convierte "marcaron el no-show" en
 * "además le asentaron la penalidad": si no hay ningún cargo, la penalidad nunca
 * se puso.
 *
 * La definición es "tiene ALGÚN cargo", no "tiene el código X", porque el código
 * lo elige el asistente según el caso y varía. A un no-show no hay otra cosa que
 * cobrarle, así que cualquier cargo es la penalidad.
 */
export function totalCargado(services: ChargedService[] | null | undefined): number {
  if (!Array.isArray(services)) return 0;
  return services.reduce((sum, s) => sum + (Number(s?.fee) || 0), 0);
}
