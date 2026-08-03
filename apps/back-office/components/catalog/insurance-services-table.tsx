'use client';

/**
 * Tab "Servicios con seguro" — lee service_codes en vivo.
 *
 * Distinto de los otros tres tabs a propósito: acá NO hay costo real, solo el
 * fee que se le factura a la aseguradora. Por eso una sola columna de precio y
 * no el par costo/precio con margen.
 *
 * Solo lectura por ahora: esta tabla alimenta el HCFA de Brunella y ya tiene
 * 349 asignaciones en visitas — se edita desde Settings → Servicios, no acá.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@precision/ui';
import { Search as SearchIcon, ShieldPlus, AlertTriangle, DollarSign, FileWarning } from 'lucide-react';
import {
  KpiCard, FilterPill, StatusPill, TagPill, DataTable, TableFooter, EmptyState,
} from '@/components/ui-phoenix';
import { type InsuranceService, looksMangled, money } from './catalog-shared';

interface Props {
  services: InsuranceService[];
}

type Filter = 'all' | 'noFee' | 'mangled' | 'inactive';

const PAGE_SIZE = 25;

/** Color por familia de servicio, para poder barrer la lista con la vista. */
const CATEGORY_TONE: Record<string, string> = {
  LAB: 'text-cyan border-cyan/30 bg-cyan/10',
  EM: 'text-brand border-brand/30 bg-brand/10',
  IMAGING: 'text-violet border-violet/30 bg-violet/10',
  SURGERY: 'text-rose border-rose/30 bg-rose/10',
  INJECTIONS: 'text-amber border-amber/30 bg-amber/10',
  DRUGS: 'text-amber border-amber/30 bg-amber/10',
  DME: 'text-emerald border-emerald/30 bg-emerald/10',
  PHYSICAL_THERAPY: 'text-emerald border-emerald/30 bg-emerald/10',
  CHIROPRACTIC: 'text-emerald border-emerald/30 bg-emerald/10',
  REPORTS: 'text-pink border-pink/30 bg-pink/10',
};
const toneFor = (c: string): string => CATEGORY_TONE[c] ?? 'text-text-muted border-border bg-white/5';

export function InsuranceServicesTable({ services }: Props): React.ReactElement {
  const t = useTranslations('phoenix.catalog');

  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [page, setPage] = React.useState(0);

  React.useEffect(() => { setPage(0); }, [q, filter]);

  const counts = React.useMemo(() => ({
    all: services.length,
    noFee: services.filter((s) => !s.currentFee).length,
    mangled: services.filter((s) => looksMangled(s.shortDescription)).length,
    inactive: services.filter((s) => !s.isActive).length,
  }), [services]);

  const avgFee = React.useMemo(() => {
    const withFee = services.filter((s) => s.currentFee > 0);
    return withFee.length
      ? withFee.reduce((a, s) => a + s.currentFee, 0) / withFee.length
      : null;
  }, [services]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return services.filter((s) => {
      if (needle && !`${s.shortDescription} ${s.code} ${s.category}`.toLowerCase().includes(needle)) {
        return false;
      }
      switch (filter) {
        case 'noFee':    return !s.currentFee;
        case 'mangled':  return looksMangled(s.shortDescription);
        case 'inactive': return !s.isActive;
        default:         return true;
      }
    });
  }, [services, q, filter]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
        {t('insurance.banner')}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('insurance.kpi.total')} value={counts.all} sub={t('insurance.kpi.totalSub')} icon={ShieldPlus} />
        <KpiCard
          label={t('insurance.kpi.avgFee')} value={avgFee ? money(avgFee) : '—'}
          sub={t('insurance.kpi.avgFeeSub')} icon={DollarSign}
        />
        <KpiCard
          label={t('insurance.kpi.noFee')} value={counts.noFee} sub={t('insurance.kpi.noFeeSub')}
          color={counts.noFee ? 'text-amber' : 'text-emerald'} icon={AlertTriangle}
        />
        <KpiCard
          label={t('insurance.kpi.mangled')} value={counts.mangled} sub={t('insurance.kpi.mangledSub')}
          color={counts.mangled ? 'text-amber' : 'text-emerald'} icon={FileWarning}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('insurance.searchPlaceholder')} className="pl-9"
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={t('filter.all')} count={counts.all} />
          <FilterPill active={filter === 'noFee'} onClick={() => setFilter('noFee')} label={t('insurance.filter.noFee')} count={counts.noFee} />
          <FilterPill active={filter === 'mangled'} onClick={() => setFilter('mangled')} label={t('insurance.filter.mangled')} count={counts.mangled} />
          <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filter.inactive')} count={counts.inactive} />
        </div>
      </div>

      {/* ─── Tabla (desktop) ─── */}
      <div className="hidden md:block">
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th className="sticky left-0 z-10 bg-bg-2">{t('insurance.col.service')}</DataTable.Th>
                <DataTable.Th align="center">{t('insurance.col.type')}</DataTable.Th>
                <DataTable.Th align="center">{t('insurance.col.category')}</DataTable.Th>
                <DataTable.Th align="center">{t('insurance.col.modifiers')}</DataTable.Th>
                <DataTable.Th align="right">{t('insurance.col.fee')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <DataTable.Td colSpan={5}><EmptyState.Inline message={t('empty')} /></DataTable.Td>
                  </tr>
                ) : pageItems.map((s) => {
                  const mangled = looksMangled(s.shortDescription);
                  return (
                    <DataTable.Row key={s.id} muted={!s.isActive}>
                      <DataTable.Td className="sticky left-0 z-10 bg-bg-0">
                        <div className="flex flex-col gap-0.5 min-w-[280px]">
                          <span className={mangled ? 'text-text-muted italic' : 'text-text-1'}>
                            {s.shortDescription}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-text-muted">{s.code}</span>
                            {mangled && (
                              <TagPill
                                label={t('insurance.badge.review')}
                                colorClass="text-amber border-amber/30 bg-amber/10"
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </DataTable.Td>

                      <DataTable.Td align="center">
                        <span className="font-mono text-[10px] text-text-muted">{s.type}</span>
                      </DataTable.Td>

                      <DataTable.Td align="center">
                        <TagPill label={s.category.replace(/_/g, ' ')} colorClass={toneFor(s.category)} compact />
                      </DataTable.Td>

                      <DataTable.Td align="center">
                        {s.modifiersAllowed.length ? (
                          <span className="font-mono text-[10px] text-text-muted">
                            {s.modifiersAllowed.join(' · ')}
                          </span>
                        ) : <span className="text-text-muted">—</span>}
                      </DataTable.Td>

                      <DataTable.Td align="right">
                        {s.currentFee ? (
                          <span className="font-mono text-text-1 font-semibold">{money(s.currentFee)}</span>
                        ) : (
                          <span className="text-amber text-[11px] flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3 h-3" /> {t('insurance.noFee')}
                          </span>
                        )}
                      </DataTable.Td>
                    </DataTable.Row>
                  );
                })}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
          <TableFooter
            left={t('footer.count', { shown: pageItems.length, total: filtered.length })}
            right={pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-2 py-1 rounded-md border border-border disabled:opacity-40 hover:bg-white/[0.02]"
                >←</button>
                <span className="text-text-muted">{page + 1} / {pageCount}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                  className="px-2 py-1 rounded-md border border-border disabled:opacity-40 hover:bg-white/[0.02]"
                >→</button>
              </div>
            ) : null}
          />
        </DataTable.Card>
      </div>

      {/* ─── Cards (mobile) ─── */}
      <div className="md:hidden space-y-3">
        {pageItems.length === 0 ? (
          <EmptyState.Rich icon={ShieldPlus} title={t('empty')} />
        ) : pageItems.map((s) => {
          const mangled = looksMangled(s.shortDescription);
          return (
            <div key={s.id} className={`rounded-lg border border-border bg-bg-1 p-4 space-y-2 ${!s.isActive ? 'opacity-50' : ''}`}>
              <div className={`text-sm ${mangled ? 'text-text-muted italic' : 'text-text-1'}`}>
                {s.shortDescription}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-text-muted">{s.code}</span>
                <TagPill label={s.category.replace(/_/g, ' ')} colorClass={toneFor(s.category)} compact />
                {mangled && (
                  <TagPill label={t('insurance.badge.review')} colorClass="text-amber border-amber/30 bg-amber/10" compact />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {t('insurance.col.fee')}
                </span>
                {s.currentFee ? (
                  <span className="font-mono text-sm text-text-1 font-semibold">{money(s.currentFee)}</span>
                ) : (
                  <StatusPill state="warning" label={t('insurance.noFee')} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
