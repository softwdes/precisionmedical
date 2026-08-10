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
  | 'servicios' | 'braces' | 'finanzas' | 'documentos';

const CASE_TABS: ActiveTab[] = [
  'caso', 'citas', 'historial', 'labs', 'rx',
  'servicios', 'braces', 'finanzas', 'documentos',
];

/**
 * ¿El `?tab=` de la URL es un tab real? Devuelve undefined si no lo es, para
 * que el caso abra en su tab por defecto en vez de en uno inexistente.
 */
export function parseCaseTab(value: string | string[] | undefined): ActiveTab | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return CASE_TABS.find(t => t === v);
}
