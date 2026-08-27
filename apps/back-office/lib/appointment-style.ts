/**
 * Estilo visual de una cita — compartido por el calendario (B.10) y la cola de
 * Admisión del día (B.14).
 *
 * Vivía dentro de `calendar-client.tsx`. Se extrajo para que la fila de Admisión
 * hable el MISMO idioma que la tarjeta del calendario: una cita cancelada o un
 * no-show se ven igual en las dos pantallas. Si esto se copiaba en vez de
 * compartirse, los dos mapas de color se iban a separar en la primera corrección.
 *
 * Dos reglas que no hay que romper al tocar esto:
 *
 * 1. **El TEXTO sale de una variable por tema, nunca de un hex.** Antes cada rama
 *    devolvía su propio tono claro (`#fca5a5` para MVA…) elegido para fondo
 *    oscuro. El tema claro cambia `--text-1` de casi-blanco a casi-negro, pero
 *    estas tarjetas no usaban la variable: en claro quedaba fondo rosa pálido
 *    sobre blanco Y texto rosa pálido encima. Lo reportó el staff. Los tonos
 *    viven en `--cal-text-*` (globals.css).
 *
 * 2. **El estado manda sobre el tipo.** Las ramas de estado van PRIMERO: una MVA
 *    cancelada es una cancelada, no una MVA.
 */

/**
 * Lo mínimo que hace falta para pintar una cita. Estructural a propósito: el
 * calendario y Admisión traen tipos distintos (cada uno con sus propios campos
 * extra) y los dos encajan acá sin convertir nada.
 */
export interface StyleableAppointment {
  status: string;
  type: string;
  /**
   * 0 = primera cita. Opcional porque no todas las pantallas lo traen (la cola de
   * Admisión, por ejemplo): sin el dato no se aplica el realce de primera visita,
   * que es exactamente lo correcto — no se puede afirmar lo que no se sabe.
   */
  visitNumber?: number;
  isOnline?: boolean;
  /** Cancelación tardía: consumió el horario y admite penalidad. */
  cancelledSameDay?: boolean;
  case?: { accidentType?: string | null } | null;
}

export type EventStyle = {
  bg: string;
  border: string;
  text: string;
  glow?: string;
  badge?: string;
  /** Tachado: la cita no ocurrió. Es la señal fuerte; el color solo acompaña. */
  strike?: boolean;
  /** Canto izquierdo de modalidad. Ver `getEventStyle`. */
  edge?: string;
};

/** Cyan: es el token de telemedicina en toda la app (el toggle del diálogo de
 *  cita, el bloque de vitales del Resumen). No es un color nuevo.
 *  Exportado porque la leyenda del calendario dibuja la muestra del canto. */
export const ONLINE_EDGE = 'rgba(6,182,212,0.95)';

/**
 * El estilo de la tarjeta + el canto de modalidad.
 *
 * "En línea" es ORTOGONAL a los dos ejes de color de `baseEventStyle` (estado y
 * tipo), así que no puede pintar el relleno: una MVA online pintada de cyan deja
 * de leerse como MVA y se pierde más de lo que se gana. Va en otro canal —el
 * borde izquierdo— y así convive con los ocho colores de la leyenda.
 *
 * Es la única señal que sobrevive a la vista MES, donde la tarjeta es una línea
 * de 9,5px truncada y no cabe ningún icono.
 */
export function getEventStyle(appt: StyleableAppointment): EventStyle {
  const base = baseEventStyle(appt);
  return appt.isOnline ? { ...base, edge: ONLINE_EDGE } : base;
}

/**
 * Aplica el canto. Se esparce DESPUÉS de `border` en el objeto de estilo: React
 * escribe las propiedades en orden, así que `borderLeft*` pisa al `border`
 * abreviado. Al revés no tiene efecto.
 */
export function edgeStyle(s: EventStyle): React.CSSProperties | undefined {
  return s.edge ? { borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: s.edge } : undefined;
}

export function baseEventStyle(appt: StyleableAppointment): EventStyle {
  const isFirst = appt.visitNumber === 0;
  const isCompleted = appt.status === 'COMPLETED';
  const isPending = appt.status === 'PENDING' || appt.status === 'SCHEDULED';

  /**
   * Cita que NO ocurrio: tachada. Va PRIMERO porque el estado manda sobre el
   * tipo — una MVA cancelada es una cancelada, no una MVA.
   *
   * Los colores salen del v2 traducidos a los tokens de la casa: `rose` para
   * cancelada (danger) y `text-muted` para no-show (apagado, no es una alarma:
   * el paciente no vino y no hay nada que atender).
   *
   * El fondo de la cancelada va MAS transparente que el de una MVA normal
   * (0.08 contra 0.15) a proposito: las MVA ya son rose, y sin esa diferencia
   * una cancelada se leia como una cita de accidente. La senal fuerte es el
   * tachado; el color solo acompana.
   */
  if (appt.status === 'CANCELLED') {
    // El mismo día va ámbar: consume el horario y cobra penalidad, así que se
    // lee más cerca de un no-show que de una cancelación con aviso. Las dos
    // siguen tachadas — esa es la señal fuerte.
    return appt.cancelledSameDay
      ? {
          bg: 'rgba(245,158,11,0.10)',
          border: 'rgba(245,158,11,0.35)',
          text: 'var(--cal-text-cancelled-sameday)',
          strike: true,
        }
      : {
          bg: 'rgba(244,63,94,0.08)',
          border: 'rgba(244,63,94,0.35)',
          text: 'var(--cal-text-cancelled)',
          strike: true,
        };
  }
  if (appt.status === 'NO_SHOW') {
    return {
      bg: 'rgba(100,116,139,0.12)',
      border: 'rgba(100,116,139,0.35)',
      text: 'var(--cal-text-noshow)',
      strike: true,
    };
  }

  if (isCompleted) {
    return {
      bg: 'rgba(99,102,241,0.18)',
      border: 'rgba(99,102,241,0.35)',
      text: 'var(--cal-text-attended)',
    };
  }
  if (isPending) {
    return {
      bg: 'rgba(245,158,11,0.15)',
      border: 'rgba(245,158,11,0.40)',
      text: 'var(--cal-text-pending)',
    };
  }

  const isMVA = appt.type === 'AUTO_ACCIDENT' || appt.case?.accidentType === 'AUTO';
  const isGM  = appt.type === 'FAMILY_PRACTICE' || appt.type === 'URGENT_CARE';

  if (isMVA && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(244,63,94,0.28),rgba(236,72,153,0.18))',
      border: 'rgba(236,72,153,0.55)',
      text: 'var(--cal-text-mva-first)',
      glow: '0 0 10px rgba(244,63,94,0.35)',
      badge: '🆕',
    };
  }
  if (isMVA) {
    return { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.40)', text: 'var(--cal-text-mva)' };
  }
  if (isGM && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(16,185,129,0.28),rgba(20,184,166,0.18))',
      border: 'rgba(16,185,129,0.55)',
      text: 'var(--cal-text-gp)',
      glow: '0 0 10px rgba(16,185,129,0.30)',
      badge: '🆕',
    };
  }
  if (isGM) {
    return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.40)', text: 'var(--cal-text-gp)' };
  }
  // Other
  return { bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.35)', text: 'var(--cal-text-other)' };
}

// El predicado de "desenlace cobrable" vive en `lib/appointment-outcome.ts`: es
// una regla de negocio, no de estilo, y la necesitan también las rutas de API —
// que no deben arrastrar este módulo.

// ─── Etiqueta del estado ─────────────────────────────────────────────────────

/**
 * El estado de la cita, en palabras y traducido.
 *
 * Vive acá por la misma razón que el color: había pantallas mostrando el ENUM
 * CRUDO al usuario —`CONFIRMED`, `NO_SHOW`— y otras traduciendo un solo caso a
 * mano (`status === 'SCHEDULED' ? 'Pending' : status`), en inglés y sin pasar por
 * i18n. Las claves ya existían todas en `phoenix.calendar`; lo que faltaba era un
 * único lugar que las usara.
 *
 * `cancelledSameDay` se distingue porque no es lo mismo: consume el horario y
 * cobra penalidad. Ver `esDesenlaceCobrable` en `appointment-outcome.ts`.
 *
 * El traductor entra por parámetro (namespace `phoenix.calendar`): este módulo no
 * puede usar hooks — lo importan también las rutas de API.
 */
export function etiquetaEstado(
  appt: { status: string; cancelledSameDay?: boolean },
  t: (key: string) => string,
): string {
  switch (appt.status) {
    case 'SCHEDULED':   return t('statusScheduled');
    case 'PENDING':     return t('statusPending');
    case 'CONFIRMED':   return t('statusConfirmed');
    case 'CHECKED_IN':  return t('statusCheckedIn');
    case 'IN_PROGRESS': return t('statusInProgress');
    case 'COMPLETED':   return t('statusCompleted');
    case 'NO_SHOW':     return t('statusNoShow');
    case 'CANCELLED':
      return appt.cancelledSameDay ? t('statusCancelledSameDay') : t('statusCancelled');
    // Un estado nuevo en la DB no puede quedar sin nombre en pantalla: se
    // muestra el crudo, que es fea señal pero visible, en vez de un hueco.
    default: return appt.status;
  }
}
