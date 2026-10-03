'use client';

/**
 * LocationSelect — selector de estado/ciudad de EEUU con búsqueda.
 * Aparece como un input clickeable que abre un popover con lista filtrable.
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';

interface Props {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  options:     string[];
  placeholder?: string;
  disabled?:   boolean;
  /**
   * Deja guardar lo que la persona escribió aunque no esté en la lista.
   *
   * Nació para la CIUDAD. El catálogo tiene 840 ciudades y aun así **430
   * pacientes tienen una que no está** (medido el 2026-10-03): algunas son
   * abreviaturas que entraron con la migración —"West Valley" por West Valley
   * City, "SLC", "SALT LAKE"— y otras son ciudades de verdad que nadie cargó.
   * Sin esto, abrir esa ficha y guardar significaba perder el dato o tener que
   * elegir una ciudad equivocada.
   *
   * Es opt-in a propósito: en el ESTADO no se quiere: son 50 y están todos.
   */
  permiteLibre?: boolean;
}

export function LocationSelect({ label, value, onChange, options, placeholder, disabled, permiteLibre }: Props) {
  const tc = useTranslations('phoenix.common');
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Cierra al hacer clic afuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Foco en el input al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="block text-[11px] font-medium text-text-2">{label}</label>

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        className={`
          w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors
          ${open ? 'border-brand ring-1 ring-brand/20' : 'border-border'}
          ${disabled ? 'opacity-40 cursor-not-allowed bg-bg-2/30' : 'bg-bg-2 hover:border-border-strong cursor-pointer'}
        `}
      >
        <span className={value ? 'text-text-1' : 'text-text-muted'}>
          {value || placeholder || tc('uiSelectPlaceholder')}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              onClick={clear}
              className="text-text-muted hover:text-rose transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-0.5 w-full min-w-[180px] rounded-md border border-border bg-bg-1 shadow-xl">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tc('uiSearchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted outline-none"
            />
          </div>

          {/* Options */}
          <ul className="max-h-48 overflow-y-auto py-1">
            {/*
              Lo escrito, como primera opción, cuando no coincide con ninguna.
              Va ARRIBA y no abajo del todo: si la lista es larga, una entrada
              al final no se ve, y esta aparece justo cuando la lista no tiene
              lo que la persona busca.
            */}
            {permiteLibre && search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onClick={() => select(search.trim())}
                  className="w-full text-left px-3 py-1.5 text-sm text-brand-text hover:bg-white/[0.04] transition-colors"
                >
                  {tc('uiUseTyped', { texto: search.trim() })}
                </button>
              </li>
            )}
            {filtered.length === 0 && !permiteLibre && (
              <li className="px-3 py-2 text-xs text-text-muted">{tc('uiNoResults')}</li>
            )}
            {filtered.map(opt => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => select(opt)}
                  className={`
                    w-full text-left px-3 py-1.5 text-sm transition-colors
                    ${opt === value ? 'bg-brand/10 text-brand-text font-medium' : 'text-text-1 hover:bg-white/[0.04]'}
                  `}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
