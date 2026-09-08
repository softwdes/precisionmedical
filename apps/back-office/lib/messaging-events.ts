/**
 * Eventos de ventana de la mensajería, para que el sobre del top bar, el menú
 * lateral y las bandejas se enteren entre sí sin esperar al próximo sondeo.
 *
 *  · `MESSAGES_READ_EVENT`  — alguien abrió un hilo (lo marcó leído): el sobre
 *    vuelve a consultar. Mismo valor que exporta `thread-view-dialog`.
 *  · `MESSAGES_BADGE_EVENT` — el sobre ya consultó y trae el número: el menú
 *    lateral lo pinta sin hacer su propia consulta. `detail: { unread }`.
 *
 * Vive en `lib/` y no en un componente para que la bandeja del abogado, que no
 * usa el diálogo de la clínica, no tenga que importar 800 líneas por una
 * constante.
 */
export const MESSAGES_READ_EVENT = 'pm:messages-read';
export const MESSAGES_BADGE_EVENT = 'pm:messages-badge';

export function anunciarLectura(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
}

export function anunciarBadge(unread: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSAGES_BADGE_EVENT, { detail: { unread } }));
  }
}
