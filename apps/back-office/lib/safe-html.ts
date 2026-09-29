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

/**
 * Escapa para insertar como texto, RESPETANDO las entidades que ya venían.
 *
 * El `&` solo se escapa cuando NO abre una entidad válida. Un `&` suelto sigue
 * saliendo `&amp;`; un `&nbsp;` que ya estaba se deja pasar y el navegador lo
 * dibuja como el espacio que es.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 *
 * Devin reportó "extra letters" en un addendum (2026-09-29): en pantalla se leía
 * `Testing Addendum after 48-hour&nbsp; window&nbsp;`. No eran letras — era el
 * código de un espacio dibujándose literal, porque acá se escapaba su `&`.
 *
 * Cae en esta rama cualquier texto SIN etiquetas, que es lo normal cuando se
 * escribe una línea corta y no se aprieta Enter: el editor no envuelve en <p>
 * pero sí convierte los espacios finales en `&nbsp;`. O sea que no era un
 * problema del addendum: le pasaba a cualquier sección de nota en ese estado.
 *
 * Sigue siendo seguro: `<` y `>` se escapan igual, así que por acá no puede
 * entrar ninguna etiqueta. Lo único que sobrevive son entidades, que son inertes.
 */
function escapeHtmlConservandoEntidades(s: string): string {
  return s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, '&amp;')
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
  if (!looksHtml) return `<p>${escapeHtmlConservandoEntidades(raw).replace(/\n/g, '<br/>')}</p>`;
  return raw
    // Casillas y blancos de los snippets (ver rich-text-editor.tsx): en la nota
    // son <input> reales; para imprimir y para el historial se dibujan como
    // ☑/☐ y como un tramo subrayado con lo escrito. Va ANTES del filtro de
    // <input>, que se lleva cualquier otro control.
    .replace(/<input\b[^>]*\bdata-check\b[^>]*>/gi, (m) =>
      /\schecked\b/i.test(m) ? '<span class="chk on">☑</span>' : '<span class="chk">☐</span>')
    .replace(/<input\b[^>]*\bdata-blank\b[^>]*>/gi, (m) => {
      const v = /\svalue="([^"]*)"/i.exec(m)?.[1] ?? '';
      return `<span class="blank">${v || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>`;
    })
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
