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
 * 2. **El DESENLACE manda sobre el tipo.** Las ramas de cancelada, no-show y
 *    atendida van PRIMERO: una MVA cancelada es una cancelada, no una MVA.
 *
 *    Decía "el estado manda sobre el tipo", y así escrita la regla se aplicó de
 *    más: "agendada" también es un estado, y su rama se comía el realce de
 *    primera visita de casi todo el calendario (ver el comentario de `isPending`).
 *    Un desenlace es un HECHO que reemplaza al tipo; "agendada" es la ausencia de
 *    un hecho, y no reemplaza nada.
 */

import { CANCELLED_SAMEDAY_FILL, CANCELLED_SAMEDAY_RING } from './appointment-colors';

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
  case?: { accidentType?: string | null; caseType?: string | null } | null;
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
 * Los sellos de la tarjeta.
 *
 * ── El problema que resuelven ───────────────────────────────────────────────
 *
 * Las dos primeras visitas —MVA y GM— usaban el MISMO `🆕` y solo cambiaba el
 * color del aro: rosa contra verde. Erick lo señaló el 2026-09-24. El ícono no
 * agregaba nada que el color no dijera ya, y quien no distingue rosa de verde
 * se quedaba sin ninguna señal.
 *
 * ── Por qué el `🆕` se queda en MVA y no en GM ──────────────────────────────
 *
 * Criterio de Erick, y es el correcto: **Edson ya tiene ese sello aprendido**.
 * La primera visita de MVA es su trabajo diario; cambiarle el símbolo días
 * antes del lanzamiento es costo sin beneficio. El que se mueve es el otro.
 *
 * Así que la primera visita de GM pasa al estetoscopio, y el coche —que no
 * estaba en uso— marca la MVA de seguimiento, que hasta ahora no tenía ningún
 * sello y se distinguía solo por el color del relleno.
 */
/** Primera visita de MVA. El de siempre: Edson lo lee sin pensar. */
export const BADGE_MVA_1RA = '🆕';
/** MVA de seguimiento. Antes no tenía sello: el tipo salía solo del color. */
export const BADGE_MVA = '🚗';
/** Primera visita de GM. El que se movió, para dejar de chocar con el `🆕`. */
export const BADGE_GM_1RA = '🩺';

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
   * ⚠️ El tipo sale del CASO, que es la misma fuente que usa el filtro.
   *
   * Antes era `appt.type === 'AUTO_ACCIDENT' || appt.case?.accidentType === 'AUTO'`
   * — el tipo de la CITA y una bandera vieja del caso— mientras que el filtro
   * "MVA · 1ª visita" y la etiqueta de texto leen `case.caseType`. Dos fuentes
   * para la misma pregunta, y cuando no coinciden la tarjeta se contradice sola.
   *
   * Erick lo vio el 2026-09-24 en Alexander Lutz (GM-3402): tarjeta **rosa de
   * MVA con el sello `🆕`** y la etiqueta diciendo **"GM 1st"**. El caso es
   * GENERAL y su cita es FAMILY_PRACTICE, pero le quedó `accidentType = 'AUTO'`
   * de cuando era MVA — el mismo resto que la fecha del accidente.
   *
   * Lo peor no era el ícono: una tarjeta pintada de MVA que el filtro de MVA
   * **no devuelve** es exactamente el reclamo de Edson. Medido: **7 citas
   * vivas** con `caseType = 'GENERAL'` y `accidentType = 'AUTO'`.
   *
   * `accidentType` deja de decidir el color justamente porque sobrevive a la
   * reclasificación. Y se mantiene el tipo de la CITA como respaldo para las
   * que no tienen caso, donde no hay `caseType` que mirar.
   *
   * ⚠️ De dónde sale `caseType`, porque no se ve. `admission/route.ts` lo
   * selecciona explícito, pero `appointments/route.ts` lo recibe por el spread
   * de `COVERAGE_FIELDS` (`lib/coverage.ts`) — no aparece escrito en su
   * `select`. Si alguien saca ese spread, acá `tipoDeCaso` queda `undefined`
   * para siempre, el color vuelve a salir solo del tipo de la CITA y **no hay
   * un solo error de `tsc`**: el campo es opcional. Lo encontró Main Push
   * revisando el push, y por eso queda anotado.
   *
   * Esto se calcula ACÁ ARRIBA, antes de los desenlaces, porque los desenlaces
   * también necesitan el sello. Ver `selloDeTipo` justo abajo.
   */
  const tipoDeCaso = appt.case?.caseType;
  const isMVA = tipoDeCaso === 'MVA' || (!tipoDeCaso && appt.type === 'AUTO_ACCIDENT');
  const isGM  = tipoDeCaso === 'GENERAL'
    || (!tipoDeCaso && (appt.type === 'FAMILY_PRACTICE' || appt.type === 'URGENT_CARE'));

  /**
   * El sello de TIPO, independiente del estado.
   *
   * Existe porque el relleno y el sello responden preguntas distintas y no
   * tienen por qué apagarse juntos: **el relleno dice qué pasó con la cita, el
   * sello dice de qué es**. Es el mismo reparto de canales que ya usa la cita
   * sin confirmar más abajo (relleno ámbar + aro del tipo), extendido a los
   * desenlaces, que habían quedado afuera por omisión y no por criterio.
   *
   * Sin esto, una vez atendida la tarjeta perdía TODA la información de tipo:
   * una MVA 1ª atendida, una GM 1ª atendida y un seguimiento atendido se veían
   * idénticos, y en la pantalla de Edson —cuyo trabajo es seguir primeras
   * visitas de MVA— eso hace imposible contar de un vistazo cuántas se
   * atendieron. En el no-show pesa todavía más: una primera visita de MVA que
   * no vino es justo la que hay que perseguir, y era la tarjeta más silenciosa
   * del calendario.
   *
   * Erick lo pidió el 2026-09-24 viendo a Aaron Black Test (MVA-3415, 22-sep):
   * la tarjeta estaba en la vista FILTRADA por "MVA · 1ª visita", la etiqueta
   * decía "MVA 1st" y el sello no estaba. Y el contador de la leyenda dice
   * "N primeras visitas 🆕" contando también las atendidas y las canceladas,
   * así que el número llevaba el sello y las tarjetas que lo componen no.
   *
   * El COLOR no cambia: el estado sigue mandando sobre el tipo para el relleno,
   * el aro y el tachado. Acá solo se agrega un canal que estaba vacío.
   */
  const selloDeTipo = (): string | undefined => {
    if (isFirst) return isMVA ? BADGE_MVA_1RA : isGM ? BADGE_GM_1RA : '🆕';
    // El seguimiento de GM nunca tuvo sello — su color alcanza y agregarle uno
    // acá lo inventaría solo para los desenlaces.
    return isMVA ? BADGE_MVA : undefined;
  };

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
    /**
     * ── Cancelada EL MISMO DÍA: relleno de "no ocurrió", aro de penalidad ────
     *
     * Antes era ámbar **de relleno** al 0.10, y una cita AGENDADA es ámbar de
     * relleno al 0.15. Cinco centésimas de opacidad separaban "viene a la
     * clínica" de "canceló y hay que cobrarle", con el tachado como única señal
     * fuerte — y el tachado se pierde en un nombre corto o una fila angosta.
     * Erick lo confundió el 2026-09-08 mirando el calendario.
     *
     * Ahora los dos ejes dicen cada uno su cosa, y ninguno depende del otro:
     *
     *  · **el RELLENO dice si ocurrió** — pizarra apagada, igual que el no-show,
     *    porque operativamente es lo mismo: el horario se consumió y nadie vino;
     *  · **el ARO dice si hay plata en juego** — ámbar fuerte (0.65, contra el
     *    0.35 de antes), que en esta paleta es el color de atención.
     *
     * Así queda separada de las tres vecinas por un eje distinto en cada caso:
     * de la AGENDADA por el relleno (pizarra contra ámbar), del NO-SHOW por el
     * aro (ámbar contra pizarra) y de la CANCELADA CON AVISO por las dos cosas.
     * El tachado se queda, pero ya no carga solo con la distinción.
     *
     * No se usó rayado, que era la idea obvia: en este calendario ya significa
     * **bloqueo de horario** y **continuación de cita**, las dos con borde
     * punteado. Un tercer significado para el mismo patrón no separa nada.
     */
    return appt.cancelledSameDay
      ? {
          bg: CANCELLED_SAMEDAY_FILL,
          border: CANCELLED_SAMEDAY_RING,
          text: 'var(--cal-text-cancelled-sameday)',
          strike: true,
          badge: selloDeTipo(),
        }
      : {
          bg: 'rgba(244,63,94,0.08)',
          border: 'rgba(244,63,94,0.35)',
          text: 'var(--cal-text-cancelled)',
          strike: true,
          badge: selloDeTipo(),
        };
  }
  if (appt.status === 'NO_SHOW') {
    return {
      bg: 'rgba(100,116,139,0.12)',
      border: 'rgba(100,116,139,0.35)',
      text: 'var(--cal-text-noshow)',
      strike: true,
      badge: selloDeTipo(),
    };
  }

  if (isCompleted) {
    return {
      bg: 'rgba(99,102,241,0.18)',
      border: 'rgba(99,102,241,0.35)',
      text: 'var(--cal-text-attended)',
      badge: selloDeTipo(),
    };
  }
  /**
   * ── Agendada / sin confirmar ───────────────────────────────────────────────
   *
   * Ámbar de relleno, como siempre. Pero la PRIMERA VISITA sobrevive, y eso es
   * una corrección, no un agregado.
   *
   * Hasta el 2026-09-14 esta rama devolvía ámbar y nada más, y como salía por
   * `return` las ramas de tipo de más abajo NO SE ALCANZABAN. `SCHEDULED` es el
   * estado con el que NACE toda cita, así que el realce de primera visita —el
   * degradado, el glow y el 🆕 que anuncia la leyenda— era inalcanzable para
   * casi todo el calendario.
   *
   * Medido ese día sobre las citas futuras: 129 de 137 (94,2%) caían acá. De
   * las 9 primeras visitas MVA futuras, 7 no se distinguían de una de control;
   * las 2 que sí eran `CHECKED_IN`, o sea pacientes que YA habían llegado a la
   * clínica — justo cuando saber que es su primera vez ya no sirve para nada.
   * Lo reportó la clínica: "tomorrow there are 4 new MVAs and I thought that in
   * this screen, it would give a marker to set these appointments apart".
   *
   * Esto NO rompe la regla 2 de la cabecera ("el estado manda sobre el tipo").
   * Esa regla existe para los DESENLACES —cancelada, no-show, atendida—, donde
   * el estado es el hecho y el tipo pasa a ser una nota al pie. "Agendada" no es
   * un desenlace: es la ausencia de uno, y el estado normal de todo lo que
   * todavía no pasó. Tragarse el tipo ahí no ordena nada, tapa.
   *
   * La señal va en OTROS canales para que las dos cosas se lean a la vez, igual
   * que hace "en línea" con el canto izquierdo:
   *
   *   · el RELLENO sigue diciendo "sin confirmar" — ámbar, sin cambios;
   *   · el ARO dice de qué tipo es — rose para MVA, emerald para GM;
   *   · el GLOW y el 🆕 dicen que es la primera vez.
   */
  if (isPending) {
    const base = {
      bg: 'rgba(245,158,11,0.15)',
      border: 'rgba(245,158,11,0.40)',
      text: 'var(--cal-text-pending)',
    };
    /*
     * El seguimiento sin confirmar también lleva su sello. Quedó afuera cuando
     * se agregó el 🚗 (2026-09-24): una MVA de seguimiento CONFIRMADA lo tenía
     * y la misma cita AGENDADA no, y las dos están igual de por pasar. Es la
     * misma incoherencia que los desenlaces, en otra rama.
     *
     * El relleno ámbar y el aro no se tocan: acá solo se llena el canal vacío.
     */
    if (!isFirst) return { ...base, badge: selloDeTipo() };

    if (isMVA) {
      return { ...base, border: 'rgba(236,72,153,0.65)', glow: '0 0 10px rgba(244,63,94,0.35)', badge: BADGE_MVA_1RA };
    }
    if (isGM) {
      return { ...base, border: 'rgba(16,185,129,0.65)', glow: '0 0 10px rgba(16,185,129,0.30)', badge: BADGE_GM_1RA };
    }
    // Primera visita de un tipo que no es ni MVA ni GM: el 🆕 igual se gana —
    // que sea la primera vez del paciente no depende de la categoría.
    return { ...base, badge: '🆕' };
  }

  if (isMVA && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(244,63,94,0.28),rgba(236,72,153,0.18))',
      border: 'rgba(236,72,153,0.55)',
      text: 'var(--cal-text-mva-first)',
      glow: '0 0 10px rgba(244,63,94,0.35)',
      badge: BADGE_MVA_1RA,
    };
  }
  if (isMVA) {
    // El coche: hasta acá la MVA de seguimiento no tenía sello y su tipo salía
    // únicamente del color del relleno (Erick, 2026-09-24).
    return { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.40)', text: 'var(--cal-text-mva)', badge: BADGE_MVA };
  }
  if (isGM && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(16,185,129,0.28),rgba(20,184,166,0.18))',
      border: 'rgba(16,185,129,0.55)',
      text: 'var(--cal-text-gp)',
      glow: '0 0 10px rgba(16,185,129,0.30)',
      badge: BADGE_GM_1RA,
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
