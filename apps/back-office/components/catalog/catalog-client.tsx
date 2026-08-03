'use client';

/**
 * Catálogo de precios — labs · inyectables y servicios · férulas.
 *
 * Reemplaza el Excel "LabCorp Lab Pricing". Lo que el Excel no podía dar y esta
 * pantalla sí: margen calculado en vivo, semáforo de verificación de precios,
 * reflex como dato y no como comentario, y búsqueda instantánea para cotizar
 * en mostrador.
 *
 * Se monta en dos lugares con el mismo componente:
 *   /doctor/catalog  → consulta (canEdit = false salvo admin)
 *   /admin/catalog   → mantenimiento
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  FlaskConical, Syringe, Bandage, ShieldPlus, Plus, Search as SearchIcon, Pencil, Trash2,
  CheckCircle2, AlertTriangle, DollarSign, ShieldCheck, TrendingUp, Ban,
} from 'lucide-react';
import { Button, Input } from '@precision/ui';
import {
  PageHeader, KpiCard, FilterPill, IconAction, StatusPill, TagPill,
  DataTable, TableFooter, EmptyState, useToast,
} from '@/components/ui-phoenix';
import { CatalogItemDialog } from './catalog-item-dialog';
import { InsuranceServicesTable } from './insurance-services-table';
import {
  type CatalogItem, type CatalogKind, type TabKey, type InsuranceService,
  TAB_KINDS, LOW_MARGIN, STALE_MONTHS,
  markup, money, monthsSinceVerified, isStale, TUBE_SWATCH,
} from './catalog-shared';

interface Props {
  /** Catálogo cash-pay (catalog_items) — pacientes SIN seguro. */
  items: CatalogItem[];
  /** service_codes leído en vivo — pacientes CON seguro. */
  services: InsuranceService[];
  canEdit: boolean;
}

type QuickFilter = 'all' | 'noCost' | 'noPrice' | 'unverified' | 'lowMargin' | 'inactive';

const PAGE_SIZE = 25;

// El tab de seguro va entre inyectables y férulas (pedido de Erick).
const TABS: Array<{ key: TabKey; icon: React.ElementType }> = [
  { key: 'LAB', icon: FlaskConical },
  { key: 'INJECTION_SERVICE', icon: Syringe },
  { key: 'INSURANCE', icon: ShieldPlus },
  { key: 'DME', icon: Bandage },
];

export function CatalogClient({ items, services, canEdit }: Props): React.ReactElement {
  const t = useTranslations('phoenix.catalog');
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = React.useState<TabKey>('LAB');
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<QuickFilter>('all');
  const [page, setPage] = React.useState(0);
  const [editing, setEditing] = React.useState<CatalogItem | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  // Cambiar de tab o de filtro vuelve a la primera página
  React.useEffect(() => { setPage(0); }, [tab, q, filter]);

  const inTab = React.useMemo(
    () => items.filter((i) => TAB_KINDS[tab].includes(i.kind)),
    [items, tab],
  );

  const counts = React.useMemo(() => ({
    all: inTab.length,
    noCost: inTab.filter((i) => i.costPrice == null).length,
    noPrice: inTab.filter((i) => i.publicPrice == null).length,
    unverified: inTab.filter((i) => i.priceStatus !== 'VERIFIED' || isStale(i)).length,
    lowMargin: inTab.filter((i) => { const m = markup(i); return m != null && m < LOW_MARGIN; }).length,
    inactive: inTab.filter((i) => !i.isActive).length,
  }), [inTab]);

  const avgMarkup = React.useMemo(() => {
    const ms = inTab.map(markup).filter((m): m is number => m != null);
    return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  }, [inTab]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inTab.filter((i) => {
      if (needle && !`${i.name} ${i.code}`.toLowerCase().includes(needle)) return false;
      switch (filter) {
        case 'noCost':     return i.costPrice == null;
        case 'noPrice':    return i.publicPrice == null;
        case 'unverified': return i.priceStatus !== 'VERIFIED' || isStale(i);
        case 'lowMargin':  { const m = markup(i); return m != null && m < LOW_MARGIN; }
        case 'inactive':   return !i.isActive;
        default:           return true;
      }
    });
  }, [inTab, q, filter]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const isLabTab = tab === 'LAB';
  const isDmeTab = tab === 'DME';
  /** Este tab no sale de catalog_items: lee service_codes y no se edita acá. */
  const isInsuranceTab = tab === 'INSURANCE';
  const defaultKind: CatalogKind = tab === 'INJECTION_SERVICE' || tab === 'INSURANCE'
    ? 'INJECTION'
    : tab;

  function openNew(): void { setEditing(null); setDialogOpen(true); }
  function openEdit(item: CatalogItem): void { setEditing(item); setDialogOpen(true); }

  async function remove(item: CatalogItem): Promise<void> {
    if (!window.confirm(t('confirmDelete', { name: item.name }))) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/admin/catalog?id=${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t('toast.deleted'));
      router.refresh();
    } catch {
      toast.error(t('toast.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { total: items.length + services.length })}
        action={canEdit && !isInsuranceTab ? (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> {t('action.new')}
          </Button>
        ) : undefined}
      />

      {/* ─── Tabs ─── */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, icon: Icon }) => {
          const n = key === 'INSURANCE'
            ? services.length
            : items.filter((i) => TAB_KINDS[key].includes(i.kind)).length;
          const active = tab === key;
          return (
            <button
              key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'border-violet/40 bg-violet/10 text-text-1 font-semibold'
                  : 'border-border text-text-muted hover:bg-white/[0.02]'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-violet' : ''}`} />
              {t(`tab.${key}`)}
              <span className="text-[11px] text-text-muted">{n}</span>
            </button>
          );
        })}
      </div>

      {isInsuranceTab ? <InsuranceServicesTable services={services} /> : <>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label={t('kpi.total')} value={counts.all} sub={t(`tab.${tab}`)}
          icon={DollarSign}
        />
        <KpiCard
          label={t('kpi.noCost')} value={counts.noCost}
          sub={t('kpi.noCostSub')} color={counts.noCost ? 'text-amber' : 'text-emerald'}
          icon={AlertTriangle}
        />
        <KpiCard
          label={t('kpi.unverified')} value={counts.unverified}
          sub={t('kpi.unverifiedSub', { months: STALE_MONTHS })}
          color={counts.unverified ? 'text-amber' : 'text-emerald'}
          icon={ShieldCheck}
        />
        <KpiCard
          label={t('kpi.avgMargin')}
          value={avgMarkup ? `${avgMarkup.toFixed(2)}x` : '—'}
          sub={t('kpi.avgMarginSub', { n: counts.lowMargin })}
          color={counts.lowMargin ? 'text-amber' : 'text-emerald'}
          icon={TrendingUp}
        />
      </div>

      {/* ─── Buscador + filtros ─── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')} className="pl-9"
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={t('filter.all')} count={counts.all} />
          <FilterPill active={filter === 'noCost'} onClick={() => setFilter('noCost')} label={t('filter.noCost')} count={counts.noCost} />
          <FilterPill active={filter === 'noPrice'} onClick={() => setFilter('noPrice')} label={t('filter.noPrice')} count={counts.noPrice} />
          <FilterPill active={filter === 'unverified'} onClick={() => setFilter('unverified')} label={t('filter.unverified')} count={counts.unverified} />
          <FilterPill active={filter === 'lowMargin'} onClick={() => setFilter('lowMargin')} label={t('filter.lowMargin')} count={counts.lowMargin} />
          <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filter.inactive')} count={counts.inactive} />
        </div>
      </div>

      {/* ─── Tabla (desktop) ─── */}
      <div className="hidden md:block">
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th className="sticky left-0 z-10 bg-bg-2">{t('col.name')}</DataTable.Th>
                <DataTable.Th align="right">{t('col.cost')}</DataTable.Th>
                <DataTable.Th align="right">{t('col.public')}</DataTable.Th>
                <DataTable.Th align="center">{t('col.margin')}</DataTable.Th>
                {isLabTab && <DataTable.Th align="center">{t('col.sample')}</DataTable.Th>}
                {isDmeTab && <DataTable.Th align="center">{t('col.size')}</DataTable.Th>}
                <DataTable.Th align="center">{t('col.verified')}</DataTable.Th>
                {canEdit && (
                  <DataTable.Th align="right" className="sticky right-0 z-10 bg-bg-2">
                    {t('col.actions')}
                  </DataTable.Th>
                )}
              </DataTable.Head>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <DataTable.Td colSpan={8}>
                      <EmptyState.Inline message={t('empty')} />
                    </DataTable.Td>
                  </tr>
                ) : pageItems.map((i) => (
                  <DataTable.Row key={i.id} muted={!i.isActive}>
                    <DataTable.Td className="sticky left-0 z-10 bg-bg-0">
                      <div className="flex flex-col gap-0.5 min-w-[220px]">
                        <span className="text-text-1">{i.name}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] text-text-muted">{i.code}</span>
                          {i.hasReflex && <TagPill label={t('badge.reflex')} colorClass="text-cyan border-cyan/30 bg-cyan/10" compact />}
                          {!i.isOrderable && <TagPill label={t('badge.notOrderable')} colorClass="text-rose border-rose/30 bg-rose/10" compact />}
                          {i.replacedByCode && <TagPill label={t('badge.replacedBy', { code: i.replacedByCode })} colorClass="text-amber border-amber/30 bg-amber/10" compact />}
                          {i.alwaysFullPayment && <TagPill label={t('badge.fullPayment')} colorClass="text-violet border-violet/30 bg-violet/10" compact />}
                        </div>
                      </div>
                    </DataTable.Td>

                    <DataTable.Td align="right">
                      {i.costPrice == null ? (
                        <span className="text-amber text-[11px] flex items-center justify-end gap-1">
                          <AlertTriangle className="w-3 h-3" /> {t('missing')}
                        </span>
                      ) : (
                        <span className="font-mono text-text-2">{money(i.costPrice)}</span>
                      )}
                    </DataTable.Td>

                    <DataTable.Td align="right">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-text-1 font-semibold">{money(i.publicPrice)}</span>
                        {i.unitLabel && <span className="text-[10px] text-text-muted">{i.unitLabel}</span>}
                      </div>
                    </DataTable.Td>

                    <DataTable.Td align="center">
                      <MarginCell item={i} lowLabel={t('badge.low')} />
                    </DataTable.Td>

                    {isLabTab && (
                      <DataTable.Td align="center">
                        <div className="flex items-center justify-center gap-1">
                          {i.tubeColors.map((c) => (
                            <span key={c} title={c} className={`w-2.5 h-2.5 rounded-full ${TUBE_SWATCH[c] ?? 'bg-text-muted'}`} />
                          ))}
                          {i.containerType && (
                            <span className="text-[10px] text-text-muted ml-1">{i.containerType.replace('_', ' ')}</span>
                          )}
                          {i.specialHandling && <AlertTriangle className="w-3 h-3 text-amber ml-0.5" />}
                        </div>
                      </DataTable.Td>
                    )}

                    {isDmeTab && (
                      <DataTable.Td align="center">
                        <span className="text-[11px] text-text-muted">{i.sizeLabel ?? '—'}</span>
                      </DataTable.Td>
                    )}

                    <DataTable.Td align="center">
                      <VerifyCell item={i} />
                    </DataTable.Td>

                    {canEdit && (
                      <DataTable.Td align="right" className="sticky right-0 z-10 bg-bg-0">
                        <div className="flex items-center justify-end gap-1">
                          <IconAction onClick={() => openEdit(i)} icon={Pencil} label={t('action.edit')} />
                          <IconAction
                            onClick={() => void remove(i)} icon={Trash2}
                            label={t('action.delete')} variant="danger"
                            disabled={deletingId === i.id}
                          />
                        </div>
                      </DataTable.Td>
                    )}
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
          <TableFooter
            left={t('footer.count', { shown: pageItems.length, total: filtered.length })}
            right={
              pageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2 py-1 rounded-md border border-border disabled:opacity-40 hover:bg-white/[0.02]"
                  >←</button>
                  <span className="text-text-muted">{page + 1} / {pageCount}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="px-2 py-1 rounded-md border border-border disabled:opacity-40 hover:bg-white/[0.02]"
                  >→</button>
                </div>
              ) : null
            }
          />
        </DataTable.Card>
      </div>

      {/* ─── Cards (mobile) ─── */}
      <div className="md:hidden space-y-3">
        {pageItems.length === 0 ? (
          <EmptyState.Rich icon={FlaskConical} title={t('empty')} />
        ) : pageItems.map((i) => (
          <div key={i.id} className={`rounded-lg border border-border bg-bg-1 p-4 space-y-2 ${!i.isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-text-1 text-sm">{i.name}</div>
                <div className="font-mono text-[10px] text-text-muted">{i.code}</div>
              </div>
              {canEdit && (
                <IconAction onClick={() => openEdit(i)} icon={Pencil} label={t('action.edit')} />
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('col.cost')}</div>
                <div className={`font-mono text-sm ${i.costPrice == null ? 'text-amber' : 'text-text-2'}`}>
                  {i.costPrice == null ? t('missing') : money(i.costPrice)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('col.public')}</div>
                <div className="font-mono text-sm text-text-1 font-semibold">{money(i.publicPrice)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('col.margin')}</div>
                <MarginCell item={i} lowLabel={t('badge.low')} />
              </div>
            </div>
            <VerifyCell item={i} />
          </div>
        ))}
      </div>

      </>}

      {canEdit && !isInsuranceTab && (
        <CatalogItemDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          item={editing}
          defaultKind={defaultKind}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ─── Celdas ──────────────────────────────────────────────────────────────────

function MarginCell({ item, lowLabel }: { item: CatalogItem; lowLabel: string }): React.ReactElement {
  const m = markup(item);
  if (m == null) return <span className="text-text-muted">—</span>;
  const low = m < LOW_MARGIN;
  return (
    <div className="flex flex-col items-center">
      <span className={`font-mono text-sm ${low ? 'text-amber font-semibold' : 'text-text-2'}`}>
        {m.toFixed(2)}x
      </span>
      {low && <span className="text-[10px] text-amber">{lowLabel}</span>}
    </div>
  );
}

function VerifyCell({ item }: { item: CatalogItem }): React.ReactElement {
  const t = useTranslations('phoenix.catalog');
  const months = monthsSinceVerified(item);
  const stale = isStale(item);

  if (item.priceStatus === 'UPDATE_REQUESTED') {
    return <StatusPill state="warning" label={t('status.UPDATE_REQUESTED')} />;
  }
  if (item.priceStatus !== 'VERIFIED') {
    return <StatusPill state="danger" label={t('status.UNVERIFIED')} icon={<Ban className="w-3 h-3" />} />;
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <StatusPill
        state={stale ? 'warning' : 'active'}
        label={new Date(item.priceVerifiedAt as string).toLocaleDateString()}
        icon={stale ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      />
      {stale && months != null && (
        <span className="text-[10px] text-amber">{t('status.staleMonths', { months })}</span>
      )}
    </div>
  );
}
