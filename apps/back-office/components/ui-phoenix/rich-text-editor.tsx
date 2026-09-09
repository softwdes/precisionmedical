'use client';

/**
 * RichTextEditor — editor de texto enriquecido sin dependencias externas.
 *
 * Botonera equivalente a la del v2: Encabezado · Negrita · Itálica ·
 * Lista · Lista numerada · Cita · Enlace · Casilla · Campo en blanco.
 *
 * Trabaja con HTML (`value` / `onChange`) usando contentEditable. El HTML se
 * inyecta una sola vez por montaje (y cuando el valor cambia desde fuera),
 * para no romper la posición del cursor mientras el doctor escribe.
 *
 * Uso:
 *   <RichTextEditor value={html} onChange={setHtml} placeholder="Escribe aquí…" />
 *
 * Con `ref` expone `insertHtmlAtCursor(html)` — es lo que usa el panel de
 * snippets de la nota para agregar un bloque donde está el cursor.
 */

import * as React from 'react';
import {
  Heading, Bold, Italic, List, ListOrdered, Quote, Link2, CheckSquare, RectangleHorizontal, UserRound,
} from 'lucide-react';
import {
  type MergeField, isMergeField, mergeChipHtml, medusaTokensToChips, hasMedusaTokens,
} from '@/lib/snippet-merge';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Alto mínimo del área editable (default 160px) */
  minHeight?: number;
  disabled?: boolean;
  /**
   * Campos de combinación del paciente disponibles en la barra (solo en el
   * catálogo de snippets). Con esto, además, los `[Patient Name]` pegados desde
   * Medusa se convierten en chips con estos rótulos. Sin la prop no hay chips:
   * en la nota los campos ya llegan resueltos.
   */
  mergeFields?: ReadonlyArray<{ field: MergeField; label: string }>;
  /** Rótulo del selector de campos (i18n del llamador). */
  mergeFieldsLabel?: string;
  /**
   * Panel lateral DENTRO del recuadro del editor, a la izquierda del texto —
   * la lista "Available Snippets" de Medusa, que vive adentro de la sección y
   * no al lado. Quien lo pasa decide qué va ahí (snippets de la nota,
   * plantillas de mensaje) y cuándo se muestra; el editor solo le hace lugar.
   * En angosto va arriba del texto.
   */
  sidePanel?: React.ReactNode;
}

/** Lo que el padre puede pedirle al editor por `ref`. */
export interface RichTextEditorHandle {
  /**
   * Inserta HTML donde está el cursor. Si el cursor no está en este editor
   * (la persona nunca hizo clic adentro, o está en otra sección), va al final.
   * Dispara `onChange` igual que teclear.
   */
  insertHtmlAtCursor: (html: string) => void;
}

type Cmd = 'formatBlock' | 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink' | 'insertHTML';

/**
 * Lo que sobrevive a un pegado. Todo lo demás se desenvuelve (queda el texto)
 * o se tira. Los atributos se borran salvo `href` en enlaces http(s).
 *
 * Pegar desde Medusa (TinyMCE) es la vía por la que los chicos migran los
 * snippets a mano (plan Settings §6.1): tiene que conservar negritas, listas y
 * párrafos, y tirar fuentes, estilos inline, `class`, `id` y `span` vacíos.
 * Sin esto, `insertHTML` metía el HTML crudo del portapapeles —con
 * `font-family: Verdana` y colores— dentro de la nota.
 */
const PASTE_KEEP = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'UL', 'OL', 'LI', 'H3', 'BLOCKQUOTE', 'A']);
/** Etiquetas que se RENOMBRAN a su equivalente permitido. */
const PASTE_RENAME: Record<string, string> = {
  B: 'STRONG', I: 'EM', H1: 'H3', H2: 'H3', H4: 'H3', H5: 'H3', H6: 'H3', DIV: 'P',
};
/** Contenido que se tira ENTERO, sin dejar ni el texto. */
const PASTE_DROP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'META', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'IMG', 'BUTTON', 'SELECT', 'TEXTAREA']);

/**
 * Los dos controles que viven DENTRO del texto — la forma de los snippets de
 * Medusa ("Denies: ☐ nausea ☐ vomiting", "Started: [____]"):
 *
 *   - casilla:  `<input type="checkbox" data-check>`  — clic la marca; el estado
 *                se guarda como atributo `checked` para que viaje en el HTML.
 *   - blanco:   `<input type="text" data-blank>`      — se escribe adentro; lo
 *                escrito se guarda como atributo `value`, por lo mismo.
 *
 * Van con `contenteditable="false"`: es lo que hace que el navegador los trate
 * como controles (clic marca, se puede tipear) y no como texto del editor. Se
 * borran con Backspace igual que un caracter. Lo que queda en la nota es lo que
 * se imprime — no hay conversión a texto al firmar (Erick, 2026-09-05); la
 * impresión los dibuja como ☑/☐ y subrayado (ver lib/safe-html.ts).
 */
export const CHECKBOX_HTML = '<input type="checkbox" data-check contenteditable="false">';
export const BLANK_HTML = '<input type="text" data-blank contenteditable="false" size="8">';

function cleanInput(el: Element): Node | null {
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  if (type === 'checkbox') {
    const out = document.createElement('input');
    out.setAttribute('type', 'checkbox');
    out.setAttribute('data-check', '');
    out.setAttribute('contenteditable', 'false');
    if (el.hasAttribute('checked')) out.setAttribute('checked', '');
    return out;
  }
  if (type === 'text') {
    const out = document.createElement('input');
    out.setAttribute('type', 'text');
    out.setAttribute('data-blank', '');
    out.setAttribute('contenteditable', 'false');
    // El ancho que traía (Medusa usa `size`); si no, uno razonable.
    const size = parseInt(el.getAttribute('size') ?? '', 10);
    out.setAttribute('size', String(Number.isFinite(size) && size > 0 ? Math.min(size, 40) : 8));
    const value = el.getAttribute('value');
    if (value) out.setAttribute('value', value);
    return out;
  }
  return null; // radio, submit, hidden… no tienen lugar en una nota
}

type MergeLabel = ((f: MergeField) => string) | null;

/** Un chip `data-merge` que ya venía como chip (copiar/pegar entre snippets nuestros). */
function cleanMergeChip(el: Element, label: MergeLabel): Node | null {
  const field = el.getAttribute('data-merge');
  if (!isMergeField(field)) return null;
  // Sin catálogo (sin `label`) el chip no tiene sentido: queda su texto.
  if (!label) return document.createTextNode(el.textContent ?? '');
  const tpl = document.createElement('template');
  tpl.innerHTML = mergeChipHtml(field, label(field));
  return tpl.content.firstChild;
}

/** Texto con `[Patient Name]`… → texto con chips. Sin catálogo, el texto tal cual. */
function cleanText(text: string, label: MergeLabel): Node {
  if (!label || !hasMedusaTokens(text)) return document.createTextNode(text);
  const tpl = document.createElement('template');
  tpl.innerHTML = medusaTokensToChips(text, label);
  return tpl.content;
}

/**
 * Deja solo el HTML permitido. Exportado para poder probarlo y reusarlo.
 * `label` (rótulo por campo) activa los chips de combinación; sin él, un
 * `[Patient Name]` pegado queda como texto.
 */
export function sanitizePastedHtml(html: string, label: MergeLabel = null): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const clean = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return cleanText(node.textContent ?? '', label);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    let tag = el.tagName.toUpperCase();
    if (PASTE_DROP.has(tag)) return null;
    if (tag === 'INPUT') return cleanInput(el);
    if (tag === 'SPAN' && el.hasAttribute('data-merge')) return cleanMergeChip(el, label);
    if (PASTE_RENAME[tag]) tag = PASTE_RENAME[tag]!;

    const children: Node[] = [];
    el.childNodes.forEach((c) => { const out = clean(c); if (out) children.push(out); });

    if (!PASTE_KEEP.has(tag)) {
      // Desenvolver: se conserva lo de adentro sin la etiqueta (span, font,
      // table, td… — una tabla pegada queda como su texto en el orden original).
      const frag = document.createDocumentFragment();
      children.forEach((c) => frag.appendChild(c));
      return frag;
    }

    const out = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) out.setAttribute('href', href);
      else return (() => { const f = document.createDocumentFragment(); children.forEach((c) => f.appendChild(c)); return f; })();
    }
    children.forEach((c) => out.appendChild(c));
    // Un bloque sin nada adentro no aporta (típico `<p>&nbsp;</p>` de TinyMCE
    // repetido tres veces); se conserva UNO solo cuando es el separador legítimo.
    if ((tag === 'P' || tag === 'LI') && !out.textContent?.replace(/ /g, '').trim() && out.querySelector('br, input, span') === null) return null;
    return out;
  };

  const root = document.createElement('div');
  doc.body.childNodes.forEach((c) => { const out = clean(c); if (out) root.appendChild(out); });
  return root.innerHTML;
}

/** Texto plano → párrafos, para que un pegado sin HTML no pierda los saltos. */
function plainTextToHtml(text: string, label: MergeLabel): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const line = (s: string): string => (label && hasMedusaTokens(s) ? medusaTokensToChips(s, label) : esc(s));
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split('\n').map(line).join('<br>')}</p>`)
    .join('');
}

export const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 160,
  disabled = false,
  mergeFields,
  mergeFieldsLabel,
  sidePanel,
}, refExterno) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Arranca en '' (no en `value`) a propósito: así el efecto de sync de abajo
  // SÍ vuelca el contenido inicial en el primer render cuando se edita una
  // plantilla existente. Si arrancara igual a `value`, la condición de guarda
  // nunca dispara en el mount y el editor queda vacío aunque haya contenido.
  const lastEmitted = React.useRef<string>('');

  /** Rótulo por campo, o null si esta instancia no maneja chips. */
  const mergeLabel = React.useMemo<MergeLabel>(() => {
    if (!mergeFields?.length) return null;
    const map = new Map(mergeFields.map((m) => [m.field, m.label]));
    return (f) => map.get(f) ?? f;
  }, [mergeFields]);

  // Sincroniza el HTML externo sin pisar lo que el usuario está escribiendo
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastEmitted.current && value !== el.innerHTML) {
      el.innerHTML = value ?? '';
      lastEmitted.current = value ?? '';
    }
  }, [value]);

  const emit = React.useCallback((): void => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML === '<br>' ? '' : el.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  /**
   * Casillas y blancos: el navegador cambia la PROPIEDAD (`checked`, `value`)
   * pero `innerHTML` solo ve ATRIBUTOS. Sin este puente, marcar una casilla no
   * cambiaba el HTML que se guarda y la nota volvía a abrirse desmarcada.
   *
   * Listeners nativos y no props de React: los inputs entran por `innerHTML`,
   * no los renderiza React, así que sus eventos no llegan a `onChange` del div.
   */
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = (e: Event): void => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.hasAttribute('data-check')) t.toggleAttribute('checked', t.checked);
      else if (t.hasAttribute('data-blank')) t.setAttribute('value', t.value);
      else return;
      emit();
    };
    el.addEventListener('change', sync);
    el.addEventListener('input', sync);
    return () => { el.removeEventListener('change', sync); el.removeEventListener('input', sync); };
  }, [emit]);

  /** ¿El cursor está dentro de este editor (y no dentro de un control)? */
  const caretInside = (): boolean => {
    const el = ref.current;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!el || !node || !el.contains(node)) return false;
    // Dentro de un blanco (`<input>`) no hay dónde insertar HTML.
    return !(node instanceof Element && node.closest('input'));
  };

  /** Lleva el cursor al final del contenido. */
  const caretToEnd = (): void => {
    const el = ref.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const exec = (cmd: Cmd, arg?: string): void => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    // Si el cursor no está adentro (la barra se tocó sin haber hecho clic en el
    // texto, o el foco quedó en un campo en blanco), lo que se inserte va al
    // final en vez de a un lugar al azar.
    if (!caretInside()) { el.focus(); caretToEnd(); } else el.focus();
    // execCommand sigue siendo la vía sin dependencias soportada por todos los
    // navegadores actuales para edición enriquecida en contentEditable.
    document.execCommand(cmd, false, arg);
    emit();
  };

  React.useImperativeHandle(refExterno, () => ({
    insertHtmlAtCursor: (html: string): void => { if (html) exec('insertHTML', html); },
  }));

  const toggleHeading = (): void => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const inHeading = node instanceof Node
      ? !!(node.parentElement?.closest('h3'))
      : false;
    exec('formatBlock', inHeading ? 'p' : 'h3');
  };

  const addLink = (): void => {
    const url = window.prompt('URL:');
    if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
  };

  /**
   * Pegado: HTML limpio si viene HTML, párrafos si viene texto. Se intercepta
   * siempre, porque el pegado nativo de contentEditable mete el HTML del
   * portapapeles tal cual (fuentes, colores, `class` de la app de origen).
   */
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (!html && !text) return;
    e.preventDefault();
    const clean = html ? sanitizePastedHtml(html, mergeLabel) : plainTextToHtml(text, mergeLabel);
    if (clean) exec('insertHTML', clean);
  };

  const insertMergeField = (field: string): void => {
    if (!isMergeField(field) || !mergeLabel) return;
    exec('insertHTML', `${mergeChipHtml(field, mergeLabel(field))}&nbsp;`);
  };

  const btn = 'w-7 h-7 rounded flex items-center justify-center text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40';

  return (
    <div
      className={`rounded-md border border-border bg-bg-2 overflow-hidden focus-within:border-violet/50 transition-colors ${
        sidePanel ? 'grid grid-cols-1 md:grid-cols-[190px_minmax(0,1fr)]' : ''
      }`}
    >
      {/**
        * Panel lateral (snippets): comparte el marco con el texto, como en
        * Medusa. La línea que lo separa es chrome estructural, una sola.
        *
        * ── La ALTURA la manda esta celda ─────────────────────────────────────
        *
        * En escritorio la celda es una columna del grid, así que **se estira** a
        * la altura de la fila — y la fija el texto de la nota. El panel de
        * adentro tiene que tomar ESA altura, no una en píxeles: quien le pasaba
        * un `maxHeight` fijo (284 px, derivado del MÍNIMO del editor) dejaba
        * ocho snippets y 300 px de fondo vacío en una sección larga, y una lista
        * recortada sin aviso en una corta. Los dos síntomas eran el mismo bug
        * (Erick, 2026-09-09).
        *
        * La cadena que lo resuelve, sin medir nada: esta celda es `flex flex-col`
        * con `min-h-0`, la raíz de `InsertList` es `flex-1 min-h-0`, y su lista
        * interna `flex-1 min-h-0 overflow-y-auto`. Sin techo, el panel llena la
        * celda y la lista scrollea sola.
        *
        * ── En MÓVIL el grid cae a una columna, y ahí hay que acotar ───────────
        *
        * Sin `md:`, el panel pasa a ocupar el ancho completo ARRIBA del texto y
        * su altura la da el contenido: con ocho snippets son unos 300 px, media
        * pantalla de teléfono antes de ver una palabra de la nota — y el doctor
        * la abre en el iPad con el paciente enfrente.
        *
        * `max-h-[40vh]` lo acota SOLO en móvil (`md:max-h-none` lo suelta en
        * escritorio, donde la celda tiene que estirarse). La lista ya scrollea
        * adentro, así que no se pierde ningún snippet: se corta el empuje, no el
        * contenido. Se deja ARRIBA y no abajo a propósito — es una herramienta de
        * inserción, y mandarla debajo obligaría a scrollear la nota entera para
        * llegar a ella.
        *
        * ── Los tres llamadores están arreglados, y la precondición es `bare` ──
        *
        * El mismo defecto estaba en los dos editores de mensajería
        * (`compose-message-dialog.tsx` con `maxHeight={220 + 44}` y
        * `thread-view-dialog.tsx` con `{100 + 44 + 60}`, los dos sumándole cosas
        * al `minHeight`). Ya se borraron.
        *
        * ⚠️ **Borrar el prop solo arregla si el panel es `bare`.** En `bare`,
        * `InsertList` deja `maxHeight: undefined` y gobierna la cadena de flex;
        * sin `bare` cae al default de **260 px, igual de fijo**, así que quitar el
        * prop sería una regresión silenciosa — se cambia un techo por otro y no
        * se nota. Los tres llamadores actuales pasan `bare`, y por eso aplicó.
        *
        * Quien agregue un cuarto: si no es `bare`, el arreglo no es borrar el
        * prop sino darle una celda que le dé altura, como esta.
        */}
      {sidePanel && (
        <div className="min-h-0 max-h-[40vh] md:max-h-none border-b md:border-b-0 md:border-r border-border bg-bg-1/40 flex flex-col">
          {sidePanel}
        </div>
      )}
      <div className="min-w-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-bg-2/60 flex-wrap">
        <button type="button" onClick={toggleHeading} disabled={disabled} className={btn} title="Encabezado" aria-label="Encabezado">
          <Heading className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => exec('bold')} disabled={disabled} className={btn} title="Negrita" aria-label="Negrita">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => exec('italic')} disabled={disabled} className={btn} title="Itálica" aria-label="Itálica">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button type="button" onClick={() => exec('insertUnorderedList')} disabled={disabled} className={btn} title="Lista" aria-label="Lista">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => exec('insertOrderedList')} disabled={disabled} className={btn} title="Lista numerada" aria-label="Lista numerada">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => exec('formatBlock', 'blockquote')} disabled={disabled} className={btn} title="Cita" aria-label="Cita">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button type="button" onClick={addLink} disabled={disabled} className={btn} title="Enlace" aria-label="Enlace">
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        {/* Los dos controles de los snippets de Medusa. El espacio después de la
            casilla es para que el texto que sigue no quede pegado al cuadrito. */}
        <button type="button" onClick={() => exec('insertHTML', `${CHECKBOX_HTML}&nbsp;`)} disabled={disabled} className={btn} title="Casilla" aria-label="Casilla">
          <CheckSquare className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => exec('insertHTML', `${BLANK_HTML}&nbsp;`)} disabled={disabled} className={btn} title="Campo en blanco" aria-label="Campo en blanco">
          <RectangleHorizontal className="w-3.5 h-3.5" />
        </button>

        {/* Campos del paciente — el panel "Add Templates" de Medusa, como un
            selector: elegir uno lo inserta como chip y el selector vuelve a
            cero. Solo en el catálogo (con `mergeFields`). */}
        {mergeFields && mergeFields.length > 0 && (
          <label className="ml-auto flex items-center gap-1 text-text-muted">
            <UserRound className="w-3.5 h-3.5" />
            <select
              value=""
              disabled={disabled}
              onChange={(e) => insertMergeField(e.target.value)}
              className="h-7 max-w-[190px] rounded border border-border bg-bg-2 px-1.5 text-[11.5px] text-text-2 outline-none focus:border-violet/50 disabled:opacity-40"
              aria-label={mergeFieldsLabel}
            >
              <option value="">{mergeFieldsLabel ?? '[ … ]'}</option>
              {mergeFields.map((m) => <option key={m.field} value={m.field}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Área editable */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        data-placeholder={placeholder}
        className="rte-content px-3 py-2.5 text-[13px] text-text-1 outline-none overflow-y-auto max-h-[420px] flex-1"
        style={{ minHeight }}
      />
      </div>

      {/* Los estilos de .rte-content viven en app/globals.css */}
    </div>
  );
});
