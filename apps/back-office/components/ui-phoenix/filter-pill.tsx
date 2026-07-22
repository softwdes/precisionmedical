/**
 * FilterPill — Pill toggle para filtros rápidos de listas.
 *
 * Activo: gradient brand + texto blanco.
 * Inactivo: bg-2 + border + texto-2.
 *
 * Uso:
 *   <div className="flex gap-2 items-center flex-wrap">
 *     <FilterPill active={f === 'all'}    onClick={() => setF('all')}    label="Todas"   count={total} />
 *     <FilterPill active={f === 'active'} onClick={() => setF('active')} label="Activas" count={active} />
 *   </div>
 */

import * as React from 'react';

export interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  count?: number;
}

export function FilterPill({ active, onClick, label, count }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-gradient-brand text-white'
          : 'bg-bg-2 border border-border text-text-2 hover:text-text-1 hover:border-border-strong'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="opacity-70 font-mono ml-1">({count})</span>
      )}
    </button>
  );
}
