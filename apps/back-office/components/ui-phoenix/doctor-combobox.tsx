'use client';

/**
 * DoctorCombobox — selector de doctor reutilizable
 *
 * Muestra un input de búsqueda con dropdown. Cuando hay un doctor
 * seleccionado muestra un badge con su nombre y un X para limpiar.
 *
 * El padre es responsable de filtrar `providers` por especialidad si
 * corresponde. Este componente solo maneja la interacción de búsqueda/selección.
 */

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { PersonAvatar } from './person-avatar';

export interface DoctorComboboxProvider {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
}

interface DoctorComboboxProps {
  /** Lista de providers a mostrar en el dropdown (ya filtrada por especialidad si aplica) */
  providers: DoctorComboboxProvider[];
  /** Lista completa — para mostrar el badge del seleccionado cuando providers está filtrada */
  allProviders?: DoctorComboboxProvider[];
  /** Provider ID seleccionado */
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  placeholder?: string;
  drPrefix?: string;
}

export function DoctorCombobox({
  providers,
  allProviders,
  value,
  onChange,
  loading = false,
  placeholder = 'Buscar doctor…',
  drPrefix = 'Dr.',
}: DoctorComboboxProps) {
  const [search, setSearch]   = useState('');
  const [open,   setOpen]     = useState(false);

  const source   = allProviders ?? providers;
  const selected = value ? source.find(p => p.id === value) : null;

  const filtered = providers.filter(p =>
    !search.trim() ||
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="h-9 rounded-md border border-border bg-bg-2 animate-pulse" />;
  }

  if (providers.length === 0) {
    return <p className="text-[11px] text-text-muted italic">No hay doctores disponibles.</p>;
  }

  return (
    <div className="space-y-1">
      {/* Badge del doctor seleccionado */}
      {selected && (
        <div className="flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan/5 px-3 py-[7px] text-sm">
          <PersonAvatar firstName={selected.firstName} lastName={selected.lastName} size={6} gradientClass="bg-gradient-brand" />
          <span className="flex-1 min-w-0 truncate text-text-1 font-medium text-[12.5px]">
            {drPrefix} {selected.firstName} {selected.lastName}
          </span>
          <button
            type="button"
            onClick={() => { onChange(''); setSearch(''); }}
            className="text-text-muted hover:text-rose transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input de búsqueda + dropdown */}
      {!selected && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand/50"
          />
          {open && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-md shadow-lg z-50 overflow-hidden max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-text-muted">Sin resultados</div>
              ) : (
                filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { onChange(p.id); setSearch(''); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-row-sep last:border-0 flex items-center gap-2"
                  >
                    <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} gradientClass="bg-gradient-brand" />
                    <div className="min-w-0 flex-1">
                      <div className="text-text-1 text-sm font-medium truncate">
                        {drPrefix} {p.firstName} {p.lastName}
                      </div>
                      <div className="text-text-muted text-[10px] capitalize truncate">
                        {p.specialty.toLowerCase().replace(/_/g, ' ')}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
