'use client';

/**
 * SnippetPanel — la columna "Available Snippets" de Medusa, a la IZQUIERDA del
 * editor de cada sección de la nota.
 *
 * Es la forma que los doctores ya conocen (Erick, 2026-09-05: "igual a Medusa,
 * están acostumbrados"): buscador arriba, los títulos como enlaces uno debajo
 * del otro, el editor al lado. El clic AGREGA en el cursor, nunca reemplaza, y
 * la lista se queda para poder apilar varios — así se arma un HPI allá.
 *
 * Trae SUS snippets por API al montarse (no al cargar la nota entera de golpe)
 * y los deja en caché por un minuto: seis secciones abriendo y cerrando el
 * mismo día. Favoritos primero, después los más usados.
 *
 * Los enlaces frenan el `mousedown` para no robarle el foco al editor: si lo
 * robaran, el cursor se perdería y el snippet caería al final en vez de donde
 * estaba.
 */

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, Star, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import type { SnippetSection } from '@/lib/snippet-sections';

export interface SnippetItem {
  id: string;
  title: string;
  description: string | null;
  content: string;
  isFavorite: boolean;
  usageCount: number;
}

/**
 * Caché por sección, compartida por todos los editores de la pestaña. Un
 * minuto: lo que dura una consulta abriendo y cerrando la misma sección. Se
 * invalida al crear uno desde Configuración porque esa es otra pantalla.
 */
const cache = new Map<SnippetSection, { at: number; items: SnippetItem[] }>();
const CACHE_MS = 60_000;

async function loadSnippets(section: SnippetSection): Promise<SnippetItem[]> {
  const hit = cache.get(section);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const res = await fetch(`/api/admin/snippets?section=${section}`);
  if (!res.ok) throw new Error(String(res.status));
  const d = await res.json() as { snippets: Array<SnippetItem & { isActive: boolean }> };
  const items = d.snippets.filter((s) => s.isActive).map((s) => ({
    id: s.id, title: s.title, description: s.description, content: s.content,
    isFavorite: s.isFavorite, usageCount: s.usageCount,
  }));
  cache.set(section, { at: Date.now(), items });
  return items;
}

interface Props {
  section: SnippetSection;
  onPick: (snippet: SnippetItem) => void;
  /** Adónde ir a crear uno. null si esta pantalla no tiene acceso al catálogo. */
  settingsHref: string | null;
  /** Alto del editor de al lado, para que la lista no lo pase. */
  maxHeight?: number;
}

export function SnippetPanel({ section, onPick, settingsHref, maxHeight = 260 }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [items, setItems] = React.useState<SnippetItem[] | null>(null);
  const [error, setError] = React.useState(false);
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    setItems(null); setError(false);
    loadSnippets(section)
      .then((list) => { if (vivo) setItems(list); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [section]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((x) => !s || x.title.toLowerCase().includes(s) || (x.description ?? '').toLowerCase().includes(s))
      .sort((a, b) =>
        (Number(b.isFavorite) - Number(a.isFavorite))
        || (b.usageCount - a.usageCount)
        || a.title.localeCompare(b.title));
  }, [items, q]);

  return (
    <div className="rounded-md bg-bg-2/40 p-2 flex flex-col gap-1.5" style={{ maxHeight }}>
      {/* Buscador — como el "Search" de arriba de la lista en Medusa. */}
      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('snpPanelSearch')}
          aria-label={t('snpPanelSearch')}
          className="w-full h-7 rounded border border-border bg-bg-2 pl-6 pr-2 text-[11.5px] text-text-1 placeholder:text-text-muted outline-none focus:border-violet/50"
        />
      </div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1 shrink-0">
        {t('snpPanelHeader')}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
        {error ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-rose px-1 py-1">
            <AlertTriangle className="w-3 h-3" /> {t('snpPanelError')}
          </div>
        ) : items === null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-text-muted px-1 py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('snpPanelLoading')}
          </div>
        ) : items.length === 0 ? (
          <div className="text-[11.5px] text-text-muted px-1 py-1 space-y-1">
            <div>{t('snpPanelEmpty')}</div>
            {settingsHref && (
              <Link href={settingsHref} className="text-violet-text font-semibold hover:underline inline-flex items-center gap-1">
                {t('snpPanelCreate')} <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-[11.5px] text-text-muted px-1 py-1">{t('snpNoResults')}</div>
        ) : (
          <ul className="space-y-px">
            {filtered.map((s) => (
              <li key={s.id}>
                {/* Enlace, no botón: es el gesto de Medusa (títulos azules
                    subrayables) y así se lee como "clic = lo agrega". */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(s)}
                  title={s.description ?? t('snpPanelHint')}
                  className="w-full text-left px-1 py-[3px] rounded text-[12px] text-violet-text hover:underline hover:bg-violet/10 flex items-center gap-1.5 transition-colors"
                >
                  {s.isFavorite && <Star className="w-3 h-3 fill-amber text-amber shrink-0" />}
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
