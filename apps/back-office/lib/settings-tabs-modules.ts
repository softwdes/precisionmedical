/**
 * Pestañas de Settings gobernables por usuario.
 *
 * Vive sola y sin imports porque la comparten dos runtimes, igual que
 * `doctor-menu-modules.ts` — y por si algún día el middleware necesita mirarla.
 *
 * ## Por qué en GRUPOS y no trece casillas sueltas
 *
 * Settings tiene 13 pestañas. Trece casillas más, encima de los 8 menús del
 * back-office y los 7 del portal médico, convierten la ficha del usuario en un
 * formulario que nadie lee y que se configura mal por cansancio.
 *
 * Los grupos son los que ya existen en la cabeza de quien configura: el dato de
 * la clínica, la gente de afuera, los catálogos de plata y los registros que
 * solo se leen. Cada grupo se concede entero con un interruptor, y **recién si
 * se apaga ese interruptor aparecen las casillas de sus pestañas** (Erick,
 * 2026-09-14). Es el mismo patrón de dos niveles que ya tiene "Visión completa"
 * en los otros dos bloques de la ficha, así que no hay que aprender nada nuevo.
 *
 * ## La regla es la de los menús
 *
 * Se ve **salvo que la llave esté en `false`**. Un mapa nulo, o sin estas
 * llaves, concede las 13 — que es como funciona hoy y hay que conservarlo: nadie
 * tiene esto configurado todavía y un default restrictivo dejaría a la clínica
 * sin Settings de un día para el otro.
 *
 * ## `escritorios` NO está acá
 *
 * Es `adminOnly` en el array de pestañas: decide a quién le llegan los pedidos
 * de los bufetes. No se reparte por empleado, se tiene por rol. Ponerlo en esta
 * lista daría a entender que se le puede dar a alguien que no es admin, y no es
 * cierto — el filtro de `adminOnly` corre igual y ganaría.
 */

/** Prefijo de namespace. Los ids de pestaña son genéricos (`servicios`, `labs`). */
export const SETTINGS_TAB_PREFIX = 'settings:';

export interface GrupoDeTabs {
  /** Llave del grupo, solo para la UI de la ficha. No se guarda. */
  grupo: string;
  /** Ids de pestaña tal como están en `TABS` de `settings-client.tsx`. */
  tabs: readonly string[];
}

/**
 * Los cuatro grupos, en el orden en que aparecen las pestañas.
 *
 * Si se agrega una pestaña a `settings-client.tsx` hay que agregarla acá
 * también: lo que no esté en ningún grupo queda **siempre visible**, que es el
 * default sano (una pestaña nueva no desaparece sola), pero tampoco se puede
 * quitar hasta que se la agregue.
 */
export const GRUPOS_DE_SETTINGS: readonly GrupoDeTabs[] = [
  { grupo: 'clinica',   tabs: ['clinicas', 'especialidades', 'doctores'] },
  { grupo: 'externos',  tabs: ['bufetes', 'aseguradoras', 'ajustadores', 'referidores'] },
  { grupo: 'catalogos', tabs: ['servicios', 'labs', 'diagnosticos', 'snippets'] },
  { grupo: 'registros', tabs: ['auditlog', 'releases'] },
];

/** Todas las pestañas gobernables, aplanadas. */
export const TABS_DE_SETTINGS: readonly string[] =
  GRUPOS_DE_SETTINGS.flatMap((g) => g.tabs);

/** Llave completa tal como se guarda en `clinicModules`. */
export function settingsTabKey(tab: string): string {
  return `${SETTINGS_TAB_PREFIX}${tab}`;
}

/**
 * ¿Ve esta persona la pestaña? `mods` null o sin la llave = sí.
 *
 * Solo un `false` explícito la apaga. Nunca se pasa el mapa de OTRO usuario:
 * sale de la sesión.
 */
export function seesSettingsTab(mods: Record<string, boolean> | null, tab: string): boolean {
  return mods?.[settingsTabKey(tab)] !== false;
}
