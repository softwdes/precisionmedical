'use client';

/**
 * Autocomplete — buscador de entidades contra un endpoint `?q=`.
 *
 * Vivía dentro de `components/cases/new-case-dialog.tsx` y se sacó acá cuando la
 * edición del paciente necesitó el mismo buscador para elegir el tutor legal:
 * copiarlo habría duplicado el posicionamiento del dropdown, que es la parte
 * delicada (ver abajo) y la que ya nos costó bugs.
 *
 * Contrato del endpoint: `{ results: AutoResult[] }`. Como mínimo `id` y
 * `label`; `subtitle` se muestra en gris debajo. Los campos extra
 * (`firstName`, `email`, `age`, …) los usa el caller para pre-llenar un
 * formulario con lo que se eligió.
 *
 * El dropdown va en `FloatingPanel`, no en un portal propio a `document.body`.
 *
 * Portalear a `body` resuelve el recorte —el `transform` del DialogContent crea
 * un bloque contenedor nuevo y un dropdown `absolute` queda cortado por el
 * `overflow` del modal— pero rompe la RUEDA: Radix bloquea el scroll fuera del
 * subárbol del diálogo (react-remove-scroll), así que la lista se veía completa
 * y no scrolleaba. Es lo que pasaba con el bufete al crear un caso: 30 firmas
 * visibles y el mouse sin efecto.
 *
 * `FloatingPanel` ya resuelve las dos cosas: se monta DENTRO del `[role=dialog]`
 * cuando hay uno (con coordenadas absolutas respecto de él) y en `body` cuando
 * no, y sigue al ancla en cada scroll y resize. Este era el tercer lugar con el
 * mismo bug, después del picker de labs y el de diagnósticos.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Search as SearchIcon } from 'lucide-react';
import { Input } from '@precision/ui';
import { FloatingPanel } from './floating-panel';

export interface AutoResult {
  id: string;
  label: string;
  subtitle?: string;
  shortCode?: string;
  color?: string;
  /** Campos extra del autocomplete de pacientes (apoderado de un menor) */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  patientCode?: string;
  age?: number | null;
  /** Un apoderado menor de edad no puede firmar — el UI lo marca y bloquea */
  isMinor?: boolean;
  /** Casos vivos+cerrados del paciente — mensajería veta a los que no tienen */
  caseCount?: number;
}

export interface AutocompleteProps {
  endpoint: string;
  extraParams?: Record<string, string>;
  placeholder: string;
  selected: AutoResult | null;
  onSelect: (result: AutoResult | null) => void;
  renderAvatar?: (r: AutoResult) => React.ReactNode;
  /** Muestra la edad de cada resultado — usado al elegir apoderado */
  showAge?: boolean;
  /** Impide seleccionar resultados menores de edad (no pueden firmar) */
  blockMinors?: boolean;
  /**
   * Veto genérico de resultados: se muestran (para que se vea que existen y la
   * búsqueda no falló) pero no se pueden elegir. `blockedBadge` explica por qué
   * — sin la razón visible, un resultado que no responde al clic parece un bug.
   */
  isBlocked?: (r: AutoResult) => boolean;
  blockedBadge?: string;
  /** Mensaje cuando la búsqueda no trae nada (por defecto no se muestra nada) */
  emptyHint?: string;
  /**
   * Reemplaza `emptyHint` cuando la búsqueda no trae nada y hace falta ofrecer
   * una ACCIÓN, no solo un aviso — el caso típico es "crear a X como nuevo".
   * Recibe el texto buscado y una función para cerrar el dropdown.
   */
  renderEmpty?: (query: string, close: () => void) => React.ReactNode;
}

export function Autocomplete({
  endpoint, extraParams, placeholder, selected, onSelect, renderAvatar,
  showAge = false, blockMinors = false, isBlocked, blockedBadge, emptyHint, renderEmpty,
}: AutocompleteProps) {
  const t = useTranslations('phoenix.common');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AutoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // `extraParams` se compara SERIALIZADO, no por identidad. Los callers lo pasan
  // como literal inline (`extraParams={{ excludeId: id }}`), así que es un objeto
  // nuevo en cada render: con el objeto en las dependencias, el efecto se
  // re-disparaba solo, y como su propio `setLoading` provoca otro render, el
  // componente quedaba pidiendo al endpoint cada 200ms mientras estuviera montado.
  const paramsKey = JSON.stringify(extraParams ?? {});

  useEffect(() => {
    if (selected) { setQuery(''); setOpen(false); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, ...JSON.parse(paramsKey) as Record<string, string> });
        const res = await fetch(`${endpoint}?${params}`);
        if (res.ok) { const data = await res.json(); setResults(data.results ?? []); }
      } catch { setResults([]); } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, endpoint, paramsKey, selected]);

  // Close on outside click — check both input wrapper and portal dropdown
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !dropRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand/10 border border-brand/30">
        {renderAvatar?.(selected)}
        <div className="flex-1 min-w-0">
          <div className="text-text-1 text-sm font-medium truncate">{selected.label}</div>
          {selected.subtitle && <div className="text-text-muted text-xs truncate">{selected.subtitle}</div>}
        </div>
        <button type="button" onClick={() => onSelect(null)} className="text-text-muted hover:text-rose text-xs shrink-0">
          {t('autocompleteChange')}
        </button>
      </div>
    );
  }

  const hasEmptyState = !!renderEmpty || !!emptyHint;

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} placeholder={placeholder} className="pl-9" />
      </div>
      <FloatingPanel
        anchorRef={wrapRef}
        open={mounted && open && (results.length > 0 || loading || (hasEmptyState && query.length >= 2))}
        maxHeight={240}
      >
        <div ref={dropRef}>
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">{t('autocompleteSearching')}</div>
          ) : results.length === 0 && renderEmpty ? (
            renderEmpty(query.trim(), () => setOpen(false))
          ) : results.length === 0 && emptyHint ? (
            <div className="px-3 py-3 text-text-muted text-xs text-center">{emptyHint}</div>
          ) : results.map((r) => {
            // Un menor no puede ser apoderado, un paciente sin casos no puede
            // recibir mensajes: se muestran pero no se pueden elegir.
            const disabled = (blockMinors && r.isMinor === true) || isBlocked?.(r) === true;
            return (
              <button key={r.id} type="button" disabled={disabled}
                onMouseDown={(e) => { e.preventDefault(); if (disabled) return; onSelect(r); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'
                }`}>
                {renderAvatar?.(r)}
                <div className="flex-1 min-w-0">
                  <div className="text-text-1 truncate">{r.label}</div>
                  {r.subtitle && <div className="text-text-muted text-xs truncate">{r.subtitle}</div>}
                </div>
                {disabled && blockedBadge && isBlocked?.(r) === true && (
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/10 border border-amber/30 text-amber">
                    {blockedBadge}
                  </span>
                )}
                {showAge && r.age !== null && r.age !== undefined && (
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    r.isMinor
                      ? 'bg-rose/10 border-rose/30 text-rose'
                      : 'bg-emerald/10 border-emerald/30 text-emerald'
                  }`}>
                    {t('autocompleteYears', { age: r.age })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </FloatingPanel>
    </div>
  );
}
