/**
 * Colores de cita — fuente única para el calendario y la vista de tracking MVA.
 *
 * Vivían inline en la leyenda de `calendar-client.tsx`. Se extrajeron cuando la
 * grilla de tracking necesitó los mismos: tener dos copias garantiza que un día
 * un NO_SHOW se vea gris en una pantalla y rojo en la otra.
 *
 * El calendario NO colorea solo por estado: mezcla el tipo de caso (MVA vs
 * medicina general), si es primera visita, y el estado de la cita. Por eso hay
 * dos mapas y no uno.
 *
 * Las que NO ocurrieron —canceladas y no-shows— llevan además el texto TACHADO.
 * Ese es el detalle que las distingue de un vistazo, más que el color: ambas son
 * tonos apagados y a simple vista se confundirían entre sí.
 */

/** Estados que significan "esta cita no ocurrió". */
export const APPT_NOT_HAPPENED = ['CANCELLED', 'NO_SHOW'] as const;

export const APPT_COLORS = {
  mvaFollowUp: 'rgba(244,63,94,0.75)',
  mvaFirst:    'linear-gradient(135deg,#f43f5e,#ec4899)',
  gpFollowUp:  'rgba(16,185,129,0.75)',
  gpFirst:     'linear-gradient(135deg,#10b981,#14b8a6)',
  unconfirmed: 'rgba(245,158,11,0.75)',
  attended:    'rgba(99,102,241,0.50)',
  cancelled:   'rgba(244,63,94,0.35)',
  noShow:      'rgba(100,116,139,0.45)',
} as const;

export const MVA_FIRST_GLOW = '0 0 4px rgba(244,63,94,0.40)';

export interface ApptVisual {
  /** Valor para `style.background` — puede ser un gradiente. */
  background: string;
  /** El texto de la fila va tachado: la cita no ocurrió. */
  strike: boolean;
  /** Resplandor de primera visita MVA. */
  glow: boolean;
}

/**
 * Estado de la cita → cómo se pinta en la vista de tracking MVA.
 *
 * Todas las filas de esa vista son, por definición, la PRIMERA cita de un caso
 * MVA — así que cuando la cita sigue viva se usa el gradiente de "MVA · 1ª
 * visita", no el de seguimiento.
 */
export function apptVisual(status: string): ApptVisual {
  switch (status) {
    case 'CANCELLED':
      return { background: APPT_COLORS.cancelled, strike: true, glow: false };
    case 'NO_SHOW':
      return { background: APPT_COLORS.noShow, strike: true, glow: false };
    case 'PENDING':
      return { background: APPT_COLORS.unconfirmed, strike: false, glow: false };
    case 'CHECKED_IN':
    case 'IN_PROGRESS':
    case 'COMPLETED':
      return { background: APPT_COLORS.attended, strike: false, glow: false };
    default: // SCHEDULED, CONFIRMED
      return { background: APPT_COLORS.mvaFirst, strike: false, glow: true };
  }
}
