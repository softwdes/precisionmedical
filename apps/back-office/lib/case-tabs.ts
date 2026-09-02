/**
 * Tabs del detalle de caso — compartidos entre server y cliente.
 *
 * Vive aparte de `case-detail-client.tsx` a propósito: ese archivo es
 * `'use client'`, y una función exportada desde un módulo de cliente que un
 * server component intente EJECUTAR revienta en runtime (llega como referencia
 * de cliente, no como la función). Las páginas leen el `?tab=` en el server, así
 * que el parser tiene que estar en un módulo neutro como éste.
 *
 * Los tabs son espejo de la consulta del doctor (mismo orden e íconos); sin tab
 * de notas — viven en el Historial Médico del paciente.
 */

export type ActiveTab =
  | 'caso' | 'citas' | 'historial' | 'labs' | 'rx'
  | 'servicios' | 'braces' | 'finanzas' | 'documentos' | 'mensajes';

const CASE_TABS: ActiveTab[] = [
  'caso', 'citas', 'historial', 'labs', 'rx',
  'servicios', 'braces', 'finanzas', 'documentos',
];

/**
 * Tabs que se filtran por visita (`?visit=`).
 *
 * Paciente, Citas, Historial y Documentos quedan afuera: no son "lo que pasó en
 * una visita". Las citas son la lista de visitas en sí, y el historial médico es
 * del paciente, no de una consulta.
 */
export const TABS_CON_FILTRO_DE_VISITA = new Set<ActiveTab>([
  'labs', 'rx', 'servicios', 'braces', 'finanzas',
]);

/**
 * Tabs que ve el bufete en el Portal Legal — los mismos cuatro de v2.
 *
 * Queda acá y no en el componente porque la página del portal también los
 * necesita para validar el `?tab=` en el servidor, y este módulo es neutro
 * (ver el comentario de arriba sobre `'use client'`).
 */
export const TABS_ATTORNEY = new Set<ActiveTab>([
  'caso', 'citas', 'finanzas', 'documentos',
]);

/**
 * ¿El `?tab=` de la URL es un tab real? Devuelve undefined si no lo es, para
 * que el caso abra en su tab por defecto en vez de en uno inexistente.
 */
export function parseCaseTab(value: string | string[] | undefined): ActiveTab | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return CASE_TABS.find(t => t === v);
}
