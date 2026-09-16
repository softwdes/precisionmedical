/**
 * Candado de la nota clínica — constantes y evaluación del estado.
 *
 * Decisión de Erick (2026-09-10): **el que abre la nota primero la edita y el
 * resto la ve en solo lectura.** Y ningún usuario puede arrebatársela a otro: o
 * la suelta, o el candado vence.
 *
 * Vive en `lib/` y no en el route porque **un route handler solo puede exportar
 * los verbos HTTP** — exportar una constante desde ahí rompe `next build` y
 * `tsc` no lo ve (ya nos pasó, ver el comentario de `api/twilio/presence`).
 *
 * ── Por qué DOS relojes ──────────────────────────────────────────────────────
 * `editingHeartbeatAt` dice que la PESTAÑA está viva; `editingTypedAt` dice que
 * la PERSONA está trabajando. Son cosas distintas y hacen falta las dos:
 *
 *  · Sin el latido, una iPad que se duerme deja la nota trabada para siempre con
 *    el paciente esperando en el mostrador. Ese es exactamente el motivo por el
 *    que el turno se decidía por la consulta y no por presencia — ver el
 *    docblock del PUT en `api/admin/visit-notes/[appointmentId]`.
 *  · Sin la última tecla, una pestaña abierta en otra ventana late igual
 *    mientras su dueño almuerza: la nota quedaría bloqueada dos horas con la
 *    pestaña "viva".
 */

/** Cada cuánto late el navegador que tiene la nota abierta. */
export const LATIDO_MS = 20_000;

/**
 * Sin latido por este tiempo, la pestaña se da por muerta y el candado se
 * suelta. Son tres latidos: con dos, un pico de red o una pestaña que el
 * navegador congela un rato le quitaría la nota a alguien que sigue escribiendo.
 */
export const TTL_MS = 60_000;

/**
 * Sin tocar una tecla por este tiempo, la nota se guarda donde está y se cierra
 * sola, aunque la pestaña siga viva. 10 minutos: decisión de Erick.
 */
export const INACTIVIDAD_MS = 10 * 60_000;

/** Los campos del candado que hacen falta para evaluarlo. */
export interface CamposCandado {
  editingByUserId: string | null;
  editingByName: string | null;
  editingSince: Date | null;
  editingHeartbeatAt: Date | null;
  editingTypedAt: Date | null;
  waitingByUserId: string | null;
  waitingByName: string | null;
  waitingSince: Date | null;
}

export type MotivoLibre = 'nadie' | 'pestana-muerta' | 'inactividad';

export interface EstadoCandado {
  /** `true` si AHORA MISMO alguien lo tiene y el candado vale. */
  tomado: boolean;
  /** Quién lo tiene, solo si `tomado`. */
  porUserId: string | null;
  porNombre: string | null;
  desde: Date | null;
  /** Por qué está libre, cuando no está tomado. Sirve para el mensaje. */
  motivoLibre: MotivoLibre;
}

/**
 * ¿Está tomado el candado, según los relojes?
 *
 * Se evalúa contra `ahora` que entra por parámetro y no contra `new Date()`
 * adentro: así la misma función sirve en el servidor y en una prueba, y dos
 * llamadas dentro del mismo request no pueden discrepar por 3 ms.
 */
export function evaluarCandado(n: CamposCandado, ahora: Date): EstadoCandado {
  const libre = (motivo: MotivoLibre): EstadoCandado => ({
    tomado: false, porUserId: null, porNombre: null, desde: null, motivoLibre: motivo,
  });

  if (!n.editingByUserId) return libre('nadie');

  const latido = n.editingHeartbeatAt?.getTime() ?? 0;
  if (ahora.getTime() - latido > TTL_MS) return libre('pestana-muerta');

  // La última tecla puede no existir (abrió la nota y no escribió nada). En ese
  // caso cuenta el momento en que la tomó: si abrió y se fue, a los 10 minutos
  // la suelta igual.
  const tecla = (n.editingTypedAt ?? n.editingSince)?.getTime() ?? 0;
  if (ahora.getTime() - tecla > INACTIVIDAD_MS) return libre('inactividad');

  return {
    tomado: true,
    porUserId: n.editingByUserId,
    porNombre: n.editingByName,
    desde: n.editingSince,
    motivoLibre: 'nadie',
  };
}

/** Los campos que limpian el candado y el pedido de espera. */
export const CANDADO_LIBRE = {
  editingByUserId: null,
  editingByName: null,
  editingSince: null,
  editingHeartbeatAt: null,
  editingTypedAt: null,
  waitingByUserId: null,
  waitingByName: null,
  waitingSince: null,
} as const;

/** Lo que el servidor le devuelve al navegador en cada latido. */
export interface RespuestaCandado {
  /** `true` si QUIEN PREGUNTA puede escribir. */
  mio: boolean;
  /** Cuando no es mío: quién lo tiene y desde cuándo (ISO). */
  porNombre: string | null;
  desde: string | null;
  /** Alguien pidió la nota con "Avisarle" — se le muestra al que la tiene. */
  esperando: { nombre: string | null; desde: string | null } | null;
  /**
   * El candado se me soltó por inactividad y lo tomó otro (o quedó libre). Es lo
   * que dispara el mensaje "se guardó donde estaba y se cerró".
   */
  soltadoPorInactividad?: boolean;
  /**
   * El que la tiene es un provider.
   *
   * Es lo que convierte "la tiene Fulano" en el cartel del desalojo: el que la
   * perdió sabe por su propio estado que la tenía hace un latido, y esto le dice
   * que quien entró es un provider y no un compañero más. El server no puede
   * deducir el desalojo mirando la fila —después de desalojar, el dueño es el
   * que entró y del anterior no queda rastro—, así que lo detecta la pantalla.
   */
  porEsProvider?: boolean;
}

/**
 * Quién es "provider" para el candado.
 *
 * Erick, 2026-09-16: **«clínica cuenta todo aquel que no sea Provider»**. O sea
 * que la regla es por ROL y no por dueño de la cita — y eso no es un atajo: los
 * providers no se cubren entre ellos, «la clínica solo cambia al provider que
 * verá al paciente», así que el que entra a la nota siempre es el que la va a
 * firmar. Un ADMIN o un supervisor cuentan como clínica.
 */
export const ROLES_PROVIDER = new Set(['DOCTOR', 'PROVIDER']);

export const esProvider = (rol: string | null | undefined): boolean =>
  !!rol && ROLES_PROVIDER.has(rol);

/**
 * ¿Puede `rolQueEntra` sacarle la nota a `rolQueLaTiene` sin pedir permiso?
 *
 * Solo en una dirección: provider sobre clínica.
 *
 * ── Por qué así ─────────────────────────────────────────────────────────────
 *
 * La nota es el documento que el provider FIRMA. Que un asistente que la abrió
 * primero deje al médico mirando su propia consulta en solo lectura es el
 * "stopping point" que reportaron los providers, y era además una regresión:
 * la regla de agosto (`NOTE_IN_CONSULT`) ya decía que durante la consulta la
 * nota es del médico. El candado del 10-sep se apiló encima, ciego al rol, y le
 * ganaba dos líneas después en el mismo archivo.
 *
 * ENTRE PROVIDERS NO: ahí siguen el pedido y la espera (`waitingBy…`). Dos
 * personas que firman notas tienen el mismo derecho sobre el documento, y una
 * cadena de desalojos mutuos no termina nunca.
 *
 * Y la clínica NO desaloja al provider ni a otro de la clínica: para eso están
 * "Avisarle" y el vencimiento por inactividad, que no cambiaron.
 */
export const puedeDesalojar = (
  rolQueEntra: string | null | undefined,
  rolQueLaTiene: string | null | undefined,
): boolean => esProvider(rolQueEntra) && !esProvider(rolQueLaTiene);
