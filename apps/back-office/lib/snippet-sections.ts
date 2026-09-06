/**
 * Las categorías de snippets.
 *
 * Vive solo y sin imports porque lo comparten lugares que no pueden divergir:
 * el índice del menú Configuración (server component), la API de snippets
 * (valida el `sectionKey` que llega), el editor de la nota (qué sección abre
 * qué lista) y la mensajería (compose e hilo). Si uno agrega una categoría y
 * el otro no, la persona ve un título sin snippets o una API que rechaza lo
 * que la pantalla ofrece.
 *
 * Dos familias, como en "My Settings" de Medusa:
 *
 *   - las SEIS secciones HTML de la nota, en el orden del formulario. Es el
 *     enum `TemplateSectionKey` menos `DIAGNOSTICOS`, que guarda JSON (pares
 *     ICD-10 ↔ SNOMED) y ya tiene su propio picker.
 *   - los "Send Message Snippets", en DOS grupos (Erick 2026-09-06): los de los
 *     providers —sus temas clínicos— y los de la clínica —recepción, cobranza—.
 *     Viven en el mismo enum de la base para no recrear la columna, pero NO son
 *     secciones de la nota.
 *
 * Los rótulos NO están acá: salen de i18n con las claves `sec_<KEY>`, para que
 * la misma categoría se llame igual en todas las pantallas.
 */
export const SNIPPET_NOTE_SECTIONS = [
  'QUEJA_PRINCIPAL',
  'HPI',
  'ROS',
  'EXAMEN_FISICO',
  'EVALUACIONES',
  'PLAN',
] as const;

export const SNIPPET_MESSAGE_SECTIONS = ['MENSAJE_PROVIDER', 'MENSAJE_CLINICA'] as const;

/** Todas las categorías que admiten snippets (lo que valida la API). */
export const SNIPPET_SECTIONS = [...SNIPPET_NOTE_SECTIONS, ...SNIPPET_MESSAGE_SECTIONS] as const;

export type SnippetSection = typeof SNIPPET_SECTIONS[number];
export type SnippetNoteSection = typeof SNIPPET_NOTE_SECTIONS[number];
export type SnippetMessageSection = typeof SNIPPET_MESSAGE_SECTIONS[number];

/** Type guard para lo que llega por URL o por body. */
export function isSnippetSection(value: unknown): value is SnippetSection {
  return typeof value === 'string' && (SNIPPET_SECTIONS as readonly string[]).includes(value);
}

/**
 * Desde dónde se escribe el mensaje. Decide qué grupo de plantillas se ofrece
 * y en cuál se guarda "Guardar como plantilla": el portal médico es de los
 * providers; el back-office, de la clínica. ADMIN ve los dos (lo resuelve la
 * API, que conoce el rol; el cliente solo dice dónde está).
 */
export type MessageContext = 'portal' | 'backoffice';

export function messageContextFor(pathname: string): MessageContext {
  return pathname === '/doctor' || pathname.startsWith('/doctor/') ? 'portal' : 'backoffice';
}

/** El grupo propio de cada contexto — donde se guarda lo que uno crea al escribir. */
export function ownMessageSection(context: MessageContext): SnippetMessageSection {
  return context === 'portal' ? 'MENSAJE_PROVIDER' : 'MENSAJE_CLINICA';
}
