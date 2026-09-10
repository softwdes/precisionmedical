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
}
