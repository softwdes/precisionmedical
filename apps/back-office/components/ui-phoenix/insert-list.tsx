'use client';

/**
 * InsertList — la columna "Available Snippets" de Medusa, como primitivo.
 *
 * Buscador arriba, un rótulo, y los títulos como enlaces uno debajo del otro.
 * El clic INSERTA algo en un editor que está al lado; por eso los ítems frenan
 * el `mousedown`: si le robaran el foco al editor, el cursor se perdería y lo
 * insertado caería al final en vez de donde estaba.
 *
 * Es solo la cara. Quién trae los ítems y qué hace el clic lo decide quien lo
 * usa: la nota (snippets por sección) y la mensajería (plantillas de mensaje)
 * muestran la misma lista con fuentes distintas.
 */

import * as React from 'react';
import { Search, Star, Loader2, AlertTriangle } from 'lucide-react';
import { HoverPreview } from './hover-preview';

export interface InsertListItem {
  id: string;
  title: string;
  /** Tooltip del ítem (descripción, autor…). */
  hint?: string | null;
  /** Favorito de quien mira: estrella ámbar y va primero dentro de su grupo. */
  favorite?: boolean;
  /**
   * HTML del contenido, para la tarjeta de vista previa al pasar el mouse:
   * ver qué trae ANTES de insertarlo evita meter el equivocado y borrarlo.
   */
  preview?: string | null;
  /**
   * Rótulo de grupo. Si algún ítem lo trae, la lista se parte en grupos con
   * su encabezado, en el orden en que aparecen (mensajería: "Providers" y
   * "Clínica" cuando un admin ve los dos). Un buscador solo, para todos.
   */
  group?: string;
}

export interface InsertListProps<T extends InsertListItem> {
  /** null = cargando. */
  items: T[] | null;
  onPick: (item: T) => void;
  /** Rótulo sobre la lista ("Snippets disponibles", "Plantillas"). */
  header: string;
  searchPlaceholder: string;
  /** Qué mostrar sin ítems (texto, o texto + enlace a crear uno). */
  empty: React.ReactNode;
  /** Qué mostrar cuando la búsqueda no da nada. */
  noResults: string;
  loadingLabel: string;
  errorLabel: string;
  error?: boolean;
  /** Alto máximo, para no pasar el editor de al lado. Sin valor, se estira. */
  maxHeight?: number;
  /**
   * Sin fondo ni redondeo propios: para vivir DENTRO del recuadro de otro
   * componente (el `sidePanel` del RichTextEditor), que ya pone el marco.
   */
  bare?: boolean;
  className?: string;
}

export function InsertList<T extends InsertListItem>({
  items, onPick, header, searchPlaceholder, empty, noResults, loadingLabel, errorLabel,
  error = false, maxHeight, bare = false, className = '',
}: InsertListProps<T>): React.ReactElement {
  const [q, setQ] = React.useState('');

  /** Filtrados y agrupados. Sin grupos, un solo bloque sin encabezado. */
  const groups = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = (items ?? [])
      .filter((x) => !s || x.title.toLowerCase().includes(s) || (x.hint ?? '').toLowerCase().includes(s));
    const map = new Map<string | undefined, T[]>();
    for (const it of filtered) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return [...map.entries()].map(([label, list]) => ({
      label,
      list: list.sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)),
    }));
  }, [items, q]);
  const filteredCount = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div
      className={`${bare ? 'flex-1 min-h-0' : 'rounded-md bg-bg-2/40'} p-2 flex flex-col gap-1.5 ${className}`}
      style={{ maxHeight: maxHeight ?? (bare ? undefined : 260) }}
    >
      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full h-7 rounded border border-border bg-bg-2 pl-6 pr-2 text-[11.5px] text-text-1 placeholder:text-text-muted outline-none focus:border-violet/50"
        />
      </div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1 shrink-0">
        {header}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
        {error ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-rose px-1 py-1">
            <AlertTriangle className="w-3 h-3" /> {errorLabel}
          </div>
        ) : items === null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-text-muted px-1 py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {loadingLabel}
          </div>
        ) : items.length === 0 ? (
          <div className="text-[11.5px] text-text-muted px-1 py-1 space-y-1">{empty}</div>
        ) : filteredCount === 0 ? (
          <div className="text-[11.5px] text-text-muted px-1 py-1">{noResults}</div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.label ?? '_'} className={gi > 0 ? 'mt-2' : ''}>
              {g.label && (
                <div className="px-1 pb-0.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted/80">
                  {g.label}
                </div>
              )}
              <ul className="space-y-px">
                {g.list.map((it) => {
                  const boton = (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPick(it)}
                      // Con vista previa, el tooltip nativo sobra (y taparía la tarjeta).
                      title={it.preview ? undefined : it.hint ?? undefined}
                      className="w-full text-left px-1 py-[3px] rounded text-[12px] text-violet-text hover:underline hover:bg-violet/10 flex items-center gap-1.5 transition-colors"
                    >
                      {it.favorite && <Star className="w-3 h-3 fill-amber text-amber shrink-0" />}
                      <span className="truncate">{it.title}</span>
                    </button>
                  );
                  return (
                    <li key={it.id}>
                      {it.preview
                        ? <HoverPreview html={it.preview} title={it.title} className="w-full">{boton}</HoverPreview>
                        : boton}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
