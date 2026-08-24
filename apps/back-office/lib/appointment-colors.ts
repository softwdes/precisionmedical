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
  /**
   * Cancelada EL MISMO DÍA — ámbar, no rose.
   *
   * No son lo mismo y el sistema ya lo sabe: con aviso libera la agenda y no
   * cobra; el mismo día CONSUME el horario (ya no se llena) y cobra penalidad,
   * así que operativamente está más cerca de un no-show que de una cancelación.
   * `Appointment.cancelledSameDay` existe y la API ya lo devuelve; lo que
   * faltaba era mirarlo.
   *
   * Ámbar porque en esta paleta es el color de atención/advertencia, y porque
   * cae visualmente ENTRE la cancelada normal (rose tenue) y el no-show (gris),
   * que es donde está su significado.
   */
  cancelledSameDay: 'rgba(245,158,11,0.35)',
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
export function apptVisual(status: string, cancelledSameDay = false): ApptVisual {
  switch (status) {
    case 'CANCELLED':
      // Las dos van TACHADAS: el tachado es la señal fuerte, el color acompaña.
      return {
        background: cancelledSameDay ? APPT_COLORS.cancelledSameDay : APPT_COLORS.cancelled,
        strike: true,
        glow: false,
      };
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

/**
 * Fondo de la FILA entera cuando la cita no ocurrio.
 *
 * Edson pidio esto mirando su Excel, donde un no-show pinta el renglon completo
 * y el barre la hoja de lejos. La franja de 4px no le daba eso.
 *
 * Y pidio SUS colores, literales: amarillo para no-show, rosa para cancelada.
 * Se le hizo caso. Queda una colision conocida: el ambar de la franja tambien
 * significa "sin confirmar". Se acepta porque Edson lee la fila por el fondo,
 * no por la franja, y porque son sus dos estados de siempre.
 *
 * Los tonos viven en `globals.css` como token POR TEMA. Edson trabaja en el
 * tema CLARO —viene de su hoja de calculo— y el amarillo que funciona sobre
 * blanco se vuelve mostaza sucia sobre el fondo oscuro.
 */
export function apptRowBg(status: string): string | null {
  switch (status) {
    case 'NO_SHOW':   return 'var(--row-no-show)';
    case 'CANCELLED': return 'var(--row-cancelled)';
    default:          return null;
  }
}
