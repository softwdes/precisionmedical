'use client';

/**
 * UserMultiSelect — destinatarios To/CC con chips removibles (M1 mensajería).
 *
 * A diferencia del primitivo `Autocomplete` (single-select contra endpoint),
 * acá la lista de staff es chica y ya está en memoria (la trae el dialog una
 * sola vez de /api/messages/users), así que el filtrado es local.
 *
 * El panel lo pone `FloatingPanel`, que resuelve las tres cosas que este
 * archivo hacía a mano y mal:
 *  · el alto ACOTADO al lugar real y el volteo hacia arriba — antes era
 *    `top: rect.bottom + 4` con un `max-h-80` fijo, y en un teléfono el panel
 *    terminaba por debajo del borde inferior: como es `fixed`, la página no lo
 *    alcanza scrolleando y la lista de usuarios quedaba cortada sin forma de
 *    llegar al resto. Lo reportó Erick con una captura.
 *  · la rueda del mouse dentro de un Dialog de Radix — el primitivo monta el
 *    panel DENTRO del DialogContent, así que el scroll-lock no lo bloquea.
 *    Por eso ya no hace falta `usePortalWheelScroll` ni el `pointerEvents:
 *    'auto'` que necesitaba el portal a `document.body`.
 */

import { useState, useEffect, useRef } from 'react';
import { X as XIcon } from 'lucide-react';
import { FloatingPanel } from '@/components/ui-phoenix/floating-panel';

export interface MessagingUser {
  id: string;
  name: string;
  role: string;
}

interface Props {
  users: MessagingUser[];
  selected: MessagingUser[];
  onChange: (users: MessagingUser[]) => void;
  /** Ids que no deben ofrecerse (ej. ya elegidos en la otra línea To/CC) */
  excludeIds?: string[];
  placeholder: string;
  disabled?: boolean;
}

export function UserMultiSelect({
  users, selected, onChange, excludeIds = [], placeholder, disabled = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const taken = new Set([...selected.map((u) => u.id), ...excludeIds]);
  const options = users.filter(
    (u) => !taken.has(u.id) && u.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={wrapRef}>
      <div
        className={`flex flex-wrap items-center gap-1.5 min-h-[38px] px-2 py-1.5 rounded-md border border-border bg-bg-2/40 ${disabled ? 'opacity-50' : 'cursor-text'}`}
        onClick={() => { if (!disabled) { inputRef.current?.focus(); setOpen(true); } }}
      >
        {selected.map((u) => (
          <span key={u.id}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-text-1">
            {u.name}
            {!disabled && (
              <button type="button" aria-label={`Quitar ${u.name}`}
                onClick={(e) => { e.stopPropagation(); onChange(selected.filter((s) => s.id !== u.id)); }}
                className="text-text-muted hover:text-rose transition-colors">
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {/* La lista se abre por CLIC o al escribir — nunca por el autofocus
            que Radix dispara al montar el Dialog (abría el dropdown solo). */}
        <input
          ref={inputRef} value={query} disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onMouseDown={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && query === '' && selected.length > 0) {
              onChange(selected.slice(0, -1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (options.length > 0) { onChange([...selected, options[0]]); setQuery(''); }
            }
          }}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-text-1 placeholder:text-text-muted"
        />
      </div>

      <FloatingPanel
        anchorRef={wrapRef}
        panelRef={dropRef}
        open={open && options.length > 0}
        maxHeight={320}
        className="border border-border-strong"
      >
        {options.map((u) => (
          <button key={u.id} type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange([...selected, u]); setQuery(''); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors">
            <span className="text-text-1 truncate">{u.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-text-muted">{u.role}</span>
          </button>
        ))}
      </FloatingPanel>
    </div>
  );
}
