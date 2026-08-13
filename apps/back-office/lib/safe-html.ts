/**
 * Saneado del HTML que produce el editor de notas (`RichTextEditor`).
 *
 * Vivía duplicado dentro de la vista de impresión de la nota, y el editor en
 * pantalla inyectaba el HTML **crudo** con `dangerouslySetInnerHTML` — deuda
 * documentada en pending-tasks. Se extrae acá para que todo lo que muestre una
 * nota use el mismo filtro: la impresión, el historial del paciente y el editor.
 *
 * No es un sanitizador completo (no parsea el DOM): quita las etiquetas
 * ejecutables, los handlers `on*` y los `javascript:` de href/src, que es lo que
 * puede llegar pegando desde Word o desde un documento externo. Si algún día hace
 * falta más, el reemplazo natural es DOMPurify — y el punto de cambio es este
 * archivo, no veinte llamadas repartidas.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  // Texto pelado (notas viejas del v2, o pegado sin formato) → un párrafo, con
  // los saltos de línea respetados.
  const looksHtml = /<\/?(p|div|br|ul|ol|li|h[1-6]|strong|b|em|i|u|blockquote|a|span)\b/i.test(raw);
  if (!looksHtml) return `<p>${escapeHtml(raw).replace(/\n/g, '<br/>')}</p>`;
  return raw
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|form|input)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
}

/** ¿La sección tiene texto de verdad, o solo etiquetas vacías? */
export function hasText(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}
