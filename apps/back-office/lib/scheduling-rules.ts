/**
 * Reglas de negocio compartidas para agendar citas — hoy solo el bloqueo de
 * fin de semana (ninguna clínica atiende sábado/domingo). Un solo lugar para
 * que el sugeridor automático (available-slots) y los endpoints que
 * realmente guardan la cita (create/edit/schedule-appointment) apliquen la
 * misma regla — antes solo la aplicaba el sugeridor, así que agendar a mano
 * un sábado/domingo se guardaba sin ningún chequeo.
 */

const TIMEZONE = 'America/Denver';

/** Devuelve el día de semana en America/Denver (Mon, Tue, ..., Sun) */
export function weekdayInDenver(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'short',
  }).format(date);
}

/** ¿El timestamp UTC cae en sábado o domingo, en hora de Denver? */
export function isWeekendInDenver(date: Date): boolean {
  const weekday = weekdayInDenver(date);
  return weekday === 'Sat' || weekday === 'Sun';
}
