'use client';

/**
 * Precios — visor de mostrador (solo lectura).
 *
 * Se abre desde la lista de pacientes, al lado del historial de llamadas, y
 * está calcado de ese diálogo a propósito: los dos viven en la misma barra y
 * tienen que verse hermanos (tabs subrayados, no las tarjetas de la pantalla
 * completa del catálogo).
 *
 * Dos decisiones que lo definen:
 *
 *  · El costo real no existe acá. Este modal se abre con el paciente mirando
 *    la pantalla — el costo no viaja siquiera en el JSON (ver listPriceList).
 *
 *  · El buscador cruza los CUATRO tabs, no solo el activo. Quien atiende no
 *    sabe si "toradol" es un inyectable o un lab; el contador de cada tab
 *    muestra cuántos resultados hay ahí y se puede saltar directo.
 *
 * Los datos se piden la primera vez que se abre y quedan en memoria — no se
 * cargan con la lista de pacientes.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@precision/ui';
import {
  FlaskConical, Syringe, Bandage, ShieldPlus, Search as SearchIcon,
  Loader2, Tag, Info, X as XIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/ui-phoenix';

export type PriceListTab = 'LAB' | 'INJECTION_SERVICE' | 'INSURANCE' | 'DME';

export interface PriceListEntry {
  key: string;
  tab: PriceListTab;
  code: string;
  name: string;
  price: number;
  unitLabel: string | null;
  sizeLabel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS: Array<{ key: PriceListTab; icon: React.ElementType }> = [
  { key: 'LAB', icon: FlaskConical },
  { key: 'INJECTION_SERVICE', icon: Syringe },
  { key: 'INSURANCE', icon: ShieldPlus },
  { key: 'DME', icon: Bandage },
];

const money = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PriceListDialog({ open, onOpenChange }: Props): React.ReactElement {
  const t = useTranslations('phoenix.catalog.priceList');

  const [entries, setEntries] = React.useState<PriceListEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [tab, setTab] = React.useState<PriceListTab>('LAB');
  const [q, setQ] = React.useState('');

  // Se carga una sola vez, la primera vez que se abre.
  React.useEffect(() => {
    if (!open || entries || loading) return;
    setLoading(true);
    setError(false);
    fetch('/api/admin/catalog/price-list')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ entries: PriceListEntry[] }>;
      })
      .then((d) => setEntries(d.entries))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, entries, loading]);

  React.useEffect(() => { if (open) setQ(''); }, [open]);

  // El filtro se aplica a TODO, y de ahí sale el contador de cada tab.
  const matches = React.useMemo(() => {
    if (!entries) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(needle));
  }, [entries, q]);

  const perTab = React.useMemo(() => {
    const acc: Record<PriceListTab, number> = {
      LAB: 0, INJECTION_SERVICE: 0, INSURANCE: 0, DME: 0,
    };
    for (const e of matches) acc[e.tab]++;
    return acc;
  }, [matches]);

  // Buscar y quedarse en un tab vacío es el error más fácil de cometer: si el
  // activo no tiene resultados y otro sí, saltamos solos al primero que tenga.
  React.useEffect(() => {
    if (!q.trim() || perTab[tab] > 0) return;
    const withHits = TABS.find((x) => perTab[x.key] > 0);
    if (withHits) setTab(withHits.key);
  }, [q, perTab, tab]);

  const shown = matches.filter((e) => e.tab === tab);
  const totalInTab = (entries ?? []).filter((e) => e.tab === tab).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Buscador — cruza los cuatro tabs */}
        <div className="px-4 sm:px-6 pb-3 shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              className="w-full bg-bg-2 border border-border rounded-md pl-9 pr-9 py-2 text-sm text-text-1 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-1"
                aria-label={t('clear')}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs — el contador refleja los resultados de la búsqueda */}
        <div className="flex items-center gap-1 border-b border-border px-2 sm:px-4 overflow-x-auto shrink-0">
          {TABS.map(({ key, icon: Icon }) => {
            const on = tab === key;
            const n = perTab[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  on ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text-1'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(`tab.${key}`)}
                <span className={`tabular-nums ${n === 0 && q ? 'opacity-40' : ''}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {tab === 'INSURANCE' && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{t('insuranceNote')}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              {t('error')}
            </div>
          )}

          {!loading && !error && entries && (
            shown.length === 0 ? (
              <EmptyState.Rich
                icon={Tag}
                title={q ? t('noMatches', { q }) : t('empty')}
              />
            ) : (
              <ul className="rounded-lg border border-border overflow-hidden">
                {shown.map((e) => (
                  <li
                    key={e.key}
                    className="flex items-center justify-between gap-4 border-b border-row-sep last:border-b-0 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-text-1">{e.name}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-text-muted">{e.code}</span>
                        {e.sizeLabel && (
                          <span className="text-[10px] text-text-muted">{e.sizeLabel}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-base font-semibold text-text-1 tabular-nums">
                        {money(e.price)}
                      </div>
                      {e.unitLabel && (
                        <div className="text-[10px] text-text-muted">{e.unitLabel}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        {/* Pie */}
        <div className="border-t border-border px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-[11px] text-text-muted shrink-0">
          <span>
            {q
              ? t('countFiltered', { shown: shown.length, total: totalInTab })
              : t('count', { total: totalInTab })}
          </span>
          <span className="hidden sm:inline">{t('onlyPriced')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
