'use client';

/**
 * UserSelect — combobox de UN usuario con búsqueda por texto (M1 F2).
 *
 * Reemplaza al <select> nativo del "Bandeja de…" del inbox: con decenas de
 * usuarios la lista se vuelve inmanejable sin poder escribir para filtrar.
 * Mismas mecánicas que UserMultiSelect: dropdown en PORTAL a document.body
 * con pointerEvents:'auto' (obligatorio dentro de un Dialog de Radix) y
 * reposicionamiento en scroll/resize.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search as SearchIcon } from 'lucide-react';
import type { MessagingUser } from './user-multi-select';
import { usePortalWheelScroll } from './use-portal-wheel';

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
  const [mounted, setMounted] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({ visibility: 'hidden', pointerEvents: 'none' });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  usePortalWheelScroll(listRef, open);

  const selectedLabel =
    value === currentUserId ? myLabel : users.find((u) => u.id === value)?.name ?? myLabel;

  const q = query.trim().toLowerCase();
  const options: Array<{ id: string; name: string; role?: string }> = [
    ...(q === '' || myLabel.toLowerCase().includes(q) ? [{ id: currentUserId, name: myLabel }] : []),
    ...users.filter((u) => u.id !== currentUserId && u.name.toLowerCase().includes(q)),
  ];

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setDropStyle({ visibility: 'hidden', pointerEvents: 'none' });
      return;
    }
    const compute = () => {
      const rect = wrapRef.current!.getBoundingClientRect();
      setDropStyle({
        position: 'fixed', top: rect.bottom + 4, left: rect.left,
        width: Math.max(rect.width, 240), visibility: 'visible', pointerEvents: 'auto',
      });
    };
    compute();
    let scrollable: HTMLElement | null = wrapRef.current.parentElement;
    while (scrollable) {
      const oy = window.getComputedStyle(scrollable).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      scrollable = scrollable.parentElement;
    }
    scrollable?.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      scrollable?.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [open, options.length]);

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

      {mounted && open && createPortal(
        <div ref={dropRef} style={dropStyle}
          className="z-[9999] bg-bg-1 border border-border-strong rounded-md shadow-xl overflow-hidden">
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
              className="w-full bg-transparent outline-none text-sm text-text-1 placeholder:text-text-muted/50 pl-8 pr-3 py-2"
            />
          </div>
          {/* Rueda: la maneja usePortalWheelScroll (listener nativo) — ver hook */}
          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto">
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
        </div>,
        document.body,
      )}
    </div>
  );
}
