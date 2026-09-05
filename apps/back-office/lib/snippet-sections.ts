/**
 * Las secciones de la nota que admiten snippets.
 *
 * Vive solo y sin imports porque lo comparten tres lugares que no pueden
 * divergir: el índice del menú Settings (server component), la API de snippets
 * (valida el `sectionKey` que llega) y el editor de la nota (qué título abre
 * qué lista). Si uno agrega una sección y el otro no, el provider ve un título
 * sin snippets o una API que rechaza lo que la pantalla ofrece.
 *
 * Son las SEIS secciones HTML de la nota, en el orden del formulario. Es el
 * mismo enum `TemplateSectionKey` de las plantillas menos `DIAGNOSTICOS`, que
 * guarda JSON (pares ICD-10 ↔ SNOMED) y ya tiene su propio picker — un snippet
 * de texto ahí no tiene dónde caer.
 *
 * Los rótulos NO están acá: salen de i18n con las claves `sec_<KEY>` que ya
 * usan las plantillas y la nota, para que la misma sección se llame igual en
 * las tres pantallas.
 */
export const SNIPPET_SECTIONS = [
  'QUEJA_PRINCIPAL',
  'HPI',
  'ROS',
  'EXAMEN_FISICO',
  'EVALUACIONES',
  'PLAN',
] as const;

export type SnippetSection = typeof SNIPPET_SECTIONS[number];

/** Type guard para lo que llega por URL o por body. */
export function isSnippetSection(value: unknown): value is SnippetSection {
  return typeof value === 'string' && (SNIPPET_SECTIONS as readonly string[]).includes(value);
}
