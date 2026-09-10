'use client';

/**
 * UserSelect — combobox de UN usuario con búsqueda por texto (M1 F2).
 *
 * Reemplaza al <select> nativo del "Bandeja de…" del inbox: con decenas de
 * usuarios la lista se vuelve inmanejable sin poder escribir para filtrar.
 *
 * El panel lo pone `FloatingPanel` (igual que UserMultiSelect): acota el alto
 * al lugar real y voltea hacia arriba si abajo no entra. Antes calculaba
 * `top: rect.bottom + 4` con un `max-h-80` fijo y en un teléfono la lista
 * terminaba fuera de la pantalla, sin forma de scrollear hasta ella.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search as SearchIcon } from 'lucide-react';
import { FloatingPanel } from '@/components/ui-phoenix/floating-panel';
import type { MessagingUser } from './user-multi-select';

interface Props {
  users: MessagingUser[];
  /** userId seleccionado; el propio usuario se muestra como `myLabel` */
  value: string;
  onChange: (userId: string) => void;
  currentUserId: string;
  myLabel: string;
  searchPlaceholder: string;
  disabled?: boolean;
}

export function UserSelect({
  users, value, onChange, currentUserId, myLabel, searchPlaceholder, disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel =
    value === currentUserId ? myLabel : users.find((u) => u.id === value)?.name ?? myLabel;

  const q = query.trim().toLowerCase();
  const options: Array<{ id: string; name: string; role?: string }> = [
    ...(q === '' || myLabel.toLowerCase().includes(q) ? [{ id: currentUserId, name: myLabel }] : []),
    ...users.filter((u) => u.id !== currentUserId && u.name.toLowerCase().includes(q)),
  ];


  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Al abrir: foco directo al buscador
  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const pick = (id: string): void => { onChange(id); setOpen(false); };

  return (
    <div ref={wrapRef}>
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-between gap-2 min-w-[180px] bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text-1 outline-none focus:border-brand transition-colors disabled:opacity-50"
        aria-haspopup="listbox" aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
      </button>

      {/* `scroll={false}`: el buscador es parte FIJA del panel y solo scrollea
          la lista de abajo. Si scrolleara el panel entero, el campo se iría de
          la vista apenas bajás por la lista. */}
      <FloatingPanel
        anchorRef={wrapRef}
        panelRef={dropRef}
        open={open}
        maxHeight={320}
        minWidth={240}
        scroll={false}
        className="border border-border-strong"
      >
          <div className="relative border-b border-border/60">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef} value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options.length > 0) { e.preventDefault(); pick(options[0].id); }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent outline-none text-sm text-text-1 placeholder:text-text-muted pl-8 pr-3 py-2"
            />
          </div>
          <div role="listbox" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {options.map((u) => (
              <button key={u.id} type="button" role="option" aria-selected={u.id === value}
                onMouseDown={(e) => { e.preventDefault(); pick(u.id); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                  u.id === value ? 'bg-brand/[0.08] text-text-1 font-medium' : 'text-text-1'
                }`}>
                <span className="truncate">{u.name}</span>
                {u.role && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-text-muted">{u.role}</span>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-3 text-text-muted text-xs text-center">—</div>
            )}
          </div>
      </FloatingPanel>
    </div>
  );
}
