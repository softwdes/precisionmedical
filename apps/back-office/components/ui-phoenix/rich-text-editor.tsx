'use client';

/**
 * RichTextEditor — editor de texto enriquecido sin dependencias externas.
 *
 * Botonera equivalente a la del v2: Encabezado · Negrita · Itálica ·
 * Lista · Lista numerada · Cita · Enlace.
 *
 * Trabaja con HTML (`value` / `onChange`) usando contentEditable. El HTML se
 * inyecta una sola vez por montaje (y cuando el valor cambia desde fuera),
 * para no romper la posición del cursor mientras el doctor escribe.
 *
 * Uso:
 *   <RichTextEditor value={html} onChange={setHtml} placeholder="Escribe aquí…" />
 */

import * as React from 'react';
import { Heading, Bold, Italic, List, ListOrdered, Quote, Link2 } from 'lucide-react';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Alto mínimo del área editable (default 160px) */
  minHeight?: number;
  disabled?: boolean;
}

type Cmd = 'formatBlock' | 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink';

export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 160,
  disabled = false,
}: RichTextEditorProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Arranca en '' (no en `value`) a propósito: así el efecto de sync de abajo
  // SÍ vuelca el contenido inicial en el primer render cuando se edita una
  // plantilla existente. Si arrancara igual a `value`, la condición de guarda
  // nunca dispara en el mount y el editor queda vacío aunque haya contenido.
  const lastEmitted = React.useRef<string>('');

  // Sincroniza el HTML externo sin pisar lo que el usuario está escribiendo
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastEmitted.current && value !== el.innerHTML) {
      el.innerHTML = value ?? '';
      lastEmitted.current = value ?? '';
    }
  }, [value]);

  const emit = (): void => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML === '<br>' ? '' : el.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  };

  const exec = (cmd: Cmd, arg?: string): void => {
    if (disabled) return;
    ref.current?.focus();
    // execCommand sigue siendo la vía sin dependencias soportada por todos los
    // navegadores actuales para edición enriquecida en contentEditable.
    document.execCommand(cmd, false, arg);
    emit();
  };

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

  const btn = 'w-7 h-7 rounded flex items-center justify-center text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40';

  return (
    <div className="rounded-md border border-border bg-bg-2 overflow-hidden focus-within:border-violet/50 transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-bg-2/60">
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
      </div>

      {/* Área editable */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="rte-content px-3 py-2.5 text-[13px] text-text-1 outline-none overflow-y-auto max-h-[420px]"
        style={{ minHeight }}
      />

      {/* Los estilos de .rte-content viven en app/globals.css */}
    </div>
  );
}
