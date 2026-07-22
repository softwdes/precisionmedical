'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, Star, Trash2, Plus, Search as SearchIcon } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  FilterPill,
  IconAction,
  TagPill,
  DataTable,
  TableFooter,
  EmptyState,
} from '@/components/ui-phoenix';

// B.33 — Servicios CPT/HCPCS/Custom

const TYPE_OPTIONS = [
  { value: 'CPT',       label: 'CPT (AMA · facturable)' },
  { value: 'HCPCS',     label: 'HCPCS Level II (CMS · drugs/DME)' },
  { value: 'CUSTOM_PM', label: 'Custom PM- (interno · NO facturable)' },
];

interface Service {
  id: string;
  code: string;
  type: string;
  shortDescription: string;
  longDescription: string | null;
  category: string;
  currentFee: number;
  fiscalYear: number;
  modifiersAllowed: string[];
  bundlingNotes: string | null;
  notes: string | null;
  isActive: boolean;
  isInternalOnly: boolean;
  isFavorite: boolean;
}

interface Props {
  services: Service[];
  stats: {
    total: number;
    active: number;
    billable: number;
    internal: number;
    cpt: number;
    hcpcs: number;
    custom: number;
    favorites: number;
  };
}

export function ServicesClient({ services, stats }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.services');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<'billable' | 'internal'>('billable');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'CPT' | 'HCPCS' | 'CUSTOM_PM'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [viewing, setViewing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  const CATEGORY_OPTIONS = [
    { value: 'EM',                label: t('cat_EM') },
    { value: 'CHIROPRACTIC',      label: t('cat_CHIROPRACTIC') },
    { value: 'PHYSICAL_THERAPY',  label: t('cat_PHYSICAL_THERAPY') },
    { value: 'IMAGING',           label: t('cat_IMAGING') },
    { value: 'INJECTIONS',        label: t('cat_INJECTIONS') },
    { value: 'SURGERY',           label: t('cat_SURGERY') },
    { value: 'DME',               label: t('cat_DME') },
    { value: 'DRUGS',             label: t('cat_DRUGS') },
    { value: 'LAB',               label: t('cat_LAB') },
    { value: 'REPORTS',           label: t('cat_REPORTS') },
    { value: 'CUSTOM',            label: t('cat_CUSTOM') },
    { value: 'OTHER',             label: t('cat_OTHER') },
  ];

  const filtered = services.filter((s) => {
    if (tab === 'billable' && s.isInternalOnly) return false;
    if (tab === 'internal' && !s.isInternalOnly) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.code.toLowerCase().includes(q) && !s.shortDescription.toLowerCase().includes(q)) return false;
    }
    if (filter === 'favorites' && !s.isFavorite) return false;
    if (filter === 'CPT' && s.type !== 'CPT') return false;
    if (filter === 'HCPCS' && s.type !== 'HCPCS') return false;
    if (filter === 'CUSTOM_PM' && s.type !== 'CUSTOM_PM') return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  const toggleFavorite = async (svc: Service) => {
    await fetch(`/api/admin/services/${svc.id}/favorite`, {
      method: svc.isFavorite ? 'DELETE' : 'POST',
    });
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { billable: stats.billable, internal: stats.internal, favorites: stats.favorites, mockup: 'Mockup B.33 · Fee schedule 2026' })}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="flex gap-0 border-b border-border/30">
        <TabButton active={tab === 'billable'} onClick={() => setTab('billable')}>
          {t('tabBillable')} <span className="text-text-muted ml-1 font-mono">({stats.billable})</span>
        </TabButton>
        <TabButton active={tab === 'internal'} onClick={() => setTab('internal')}>
          {t('tabInternal')} <span className="text-text-muted ml-1 font-mono">({stats.internal})</span>
        </TabButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}       value={stats.total}     sub={`${stats.cpt} CPT · ${stats.hcpcs} HCPCS · ${stats.custom} PM`} color="text-text-1" />
        <KpiCard label={t('kpiActive')}      value={stats.active}    sub="2026" color="text-emerald" />
        <KpiCard label={t('kpiFavorites')}   value={stats.favorites} sub="B.21 autocomplete" color="text-amber" />
        <KpiCard label={t('kpiFiscalYear')}  value={2026}            sub="AMA update Jan" color="text-brand" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder={tc('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FilterPill active={filter === 'all'}        onClick={() => setFilter('all')}        label={tc('all')}        count={tab === 'billable' ? stats.billable : stats.internal} />
          <FilterPill active={filter === 'favorites'}  onClick={() => setFilter('favorites')}  label={`⭐ ${tc('favorites')}`} count={stats.favorites} />
          {tab === 'billable' && (
            <>
              <FilterPill active={filter === 'CPT'}    onClick={() => setFilter('CPT')}    label="CPT"   count={stats.cpt} />
              <FilterPill active={filter === 'HCPCS'}  onClick={() => setFilter('HCPCS')}  label="HCPCS" count={stats.hcpcs} />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-text-muted">{t('filterCategoryLabel')}</Label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-2 border border-border/30 rounded-md px-3 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand"
          >
            <option value="all">{t('filterAllCategories')}</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th align="center" width="40px">⭐</DataTable.Th>
              <DataTable.Th>{t('columnCode')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnType')}</DataTable.Th>
              <DataTable.Th>{t('columnDescription')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnCategory')}</DataTable.Th>
              <DataTable.Th align="right">{t('columnFee')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnModifiers')}</DataTable.Th>
              <DataTable.Th align="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={8}>
                    <EmptyState.Inline
                      message={search ? t('emptySearch', { query: search }) : t('emptyDefault')}
                    />
                  </DataTable.Td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <DataTable.Row key={s.id} muted={!s.isActive} highlight={s.isFavorite}>
                    <DataTable.Td align="center" className="px-2">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(s)}
                        className="hover:scale-125 transition-transform"
                        title={s.isFavorite ? t('removeFavorite') : t('addFavorite')}
                      >
                        <Star className={`w-4 h-4 ${s.isFavorite ? 'fill-amber text-amber' : 'text-text-muted/40'}`} />
                      </button>
                    </DataTable.Td>
                    <DataTable.Td>
                      <code className="text-text-1 font-mono font-bold text-sm">{s.code}</code>
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <TypePill type={s.type} />
                    </DataTable.Td>
                    <DataTable.Td>
                      <div className="text-text-1 font-semibold text-[13px]">{s.shortDescription}</div>
                      {s.longDescription && (
                        <div className="text-text-muted text-[11px] mt-0.5 line-clamp-1" title={s.longDescription}>{s.longDescription}</div>
                      )}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <CategoryPill cat={s.category} />
                    </DataTable.Td>
                    <DataTable.Td align="right">
                      <span className="text-emerald font-mono font-bold">${s.currentFee.toFixed(2)}</span>
                    </DataTable.Td>
                    <DataTable.Td align="center" className="text-text-muted font-mono text-[10px]">
                      {s.modifiersAllowed.length === 0 ? '—' : s.modifiersAllowed.join(' · ')}
                    </DataTable.Td>
                    <DataTable.Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setViewing(s)}  icon={Eye}    label={tc('view')} />
                        <IconAction onClick={() => setEditing(s)}  icon={Pencil} label={tc('edit')} />
                        <IconAction onClick={() => setDeleting(s)} icon={Trash2} label={tc('delete')} variant="danger" />
                      </div>
                    </DataTable.Td>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={t('footerShowing', { count: filtered.length })}
          right={<span className="font-mono">phoenix-dev · fiscal year 2026</span>}
        />
      </DataTable.Card>

      <ServiceDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
      />

      <ViewDialog
        service={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); }}
      />

      <DeleteConfirmDialog
        service={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

// ─── Local atoms (only domain-specific) ─────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${active ? 'text-text-1' : 'text-text-2 hover:text-text-1'}`}
    >
      {children}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand rounded-t" />}
    </button>
  );
}

function TypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CPT:       'bg-brand/15 text-brand border-brand/30',
    HCPCS:     'bg-emerald/15 text-emerald border-emerald/30',
    CUSTOM_PM: 'bg-pink/15 text-pink border-pink/30',
  };
  const labels: Record<string, string> = {
    CPT: 'CPT', HCPCS: 'HCPCS', CUSTOM_PM: 'PM-',
  };
  return <TagPill label={labels[type] ?? type} colorClass={colors[type] ?? 'bg-white/5 text-text-2 border-border/30'} mono />;
}

function CategoryPill({ cat }: { cat: string }) {
  const labels: Record<string, string> = {
    EM: 'E&M', CHIROPRACTIC: 'Chiro', PHYSICAL_THERAPY: 'PT',
    IMAGING: 'Imaging', INJECTIONS: 'Inject', SURGERY: 'Surgery',
    DME: 'DME', DRUGS: 'Drugs', LAB: 'Lab',
    REPORTS: 'Reports', CUSTOM: 'Custom', OTHER: 'Other',
  };
  return <TagPill label={labels[cat] ?? cat} colorClass="bg-bg-2 text-text-2 border-border/30" compact />;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function ServiceDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Service | null;
  onSaved: () => void;
}) {
  const t = useTranslations('phoenix.services');
  const tc = useTranslations('phoenix.common');

  const CATEGORY_OPTIONS = [
    { value: 'EM',                label: t('cat_EM') },
    { value: 'CHIROPRACTIC',      label: t('cat_CHIROPRACTIC') },
    { value: 'PHYSICAL_THERAPY',  label: t('cat_PHYSICAL_THERAPY') },
    { value: 'IMAGING',           label: t('cat_IMAGING') },
    { value: 'INJECTIONS',        label: t('cat_INJECTIONS') },
    { value: 'SURGERY',           label: t('cat_SURGERY') },
    { value: 'DME',               label: t('cat_DME') },
    { value: 'DRUGS',             label: t('cat_DRUGS') },
    { value: 'LAB',               label: t('cat_LAB') },
    { value: 'REPORTS',           label: t('cat_REPORTS') },
    { value: 'CUSTOM',            label: t('cat_CUSTOM') },
    { value: 'OTHER',             label: t('cat_OTHER') },
  ];

  const [code, setCode]         = useState(editing?.code ?? '');
  const [type, setType]         = useState(editing?.type ?? 'CPT');
  const [shortDesc, setShortDesc] = useState(editing?.shortDescription ?? '');
  const [longDesc, setLongDesc]   = useState(editing?.longDescription ?? '');
  const [category, setCategory] = useState(editing?.category ?? 'EM');
  const [currentFee, setCurrentFee] = useState(editing?.currentFee.toString() ?? '0');
  const [modifiersInput, setModifiersInput] = useState(editing?.modifiersAllowed.join(', ') ?? '');
  const [bundlingNotes, setBundlingNotes]   = useState(editing?.bundlingNotes ?? '');
  const [notes, setNotes]   = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [isInternalOnly, setIsInternalOnly] = useState(editing?.isInternalOnly ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setCode(editing?.code ?? '');
    setType(editing?.type ?? 'CPT');
    setShortDesc(editing?.shortDescription ?? '');
    setLongDesc(editing?.longDescription ?? '');
    setCategory(editing?.category ?? 'EM');
    setCurrentFee(editing?.currentFee.toString() ?? '0');
    setModifiersInput(editing?.modifiersAllowed.join(', ') ?? '');
    setBundlingNotes(editing?.bundlingNotes ?? '');
    setNotes(editing?.notes ?? '');
    setIsActive(editing?.isActive ?? true);
    setIsInternalOnly(editing?.isInternalOnly ?? false);
    setError(null);
    setLastEditingId(editingId);
  }

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (newType === 'CUSTOM_PM') setIsInternalOnly(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!code.trim()) return setError(t('validCode'));
    if (!shortDesc.trim()) return setError(t('validShortDesc'));
    if (type === 'CUSTOM_PM' && !code.startsWith('PM-')) {
      return setError(t('validCustomPm'));
    }
    setSaving(true);
    try {
      const modifiers = modifiersInput.split(',').map((m) => m.trim()).filter(Boolean);
      const res = await fetch('/api/admin/services', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          code: code.trim().toUpperCase(),
          type,
          shortDescription: shortDesc.trim(),
          longDescription: longDesc.trim() || null,
          category,
          currentFee: parseFloat(currentFee),
          modifiersAllowed: modifiers,
          bundlingNotes: bundlingNotes.trim() || null,
          notes: notes.trim() || null,
          isActive,
          isInternalOnly: type === 'CUSTOM_PM' ? true : isInternalOnly,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('dialogEditTitle', { code: editing.code }) : t('dialogCreateTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="code">{t('fieldCode')} <span className="text-rose">*</span></Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="99213, J3301, PM-NARRATIVE" autoFocus />
            </div>
            <div>
              <Label htmlFor="type">{t('fieldType')}</Label>
              <select id="type" value={type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full bg-bg-2 border border-border/30 rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="currentFee">{t('fieldFee')} <span className="text-rose">*</span></Label>
              <Input id="currentFee" type="number" step="0.01" min="0" value={currentFee} onChange={(e) => setCurrentFee(e.target.value)} placeholder="300.00" />
            </div>
          </div>

          <div>
            <Label htmlFor="shortDesc">{t('fieldShortDesc')} <span className="text-rose">*</span></Label>
            <Input id="shortDesc" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="Office visit · 15 min" />
          </div>

          <div>
            <Label htmlFor="longDesc">{t('fieldDescFull')}</Label>
            <textarea
              id="longDesc"
              value={longDesc ?? ''}
              onChange={(e) => setLongDesc(e.target.value)}
              className="w-full bg-bg-2 border border-border/30 rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="Office or other outpatient visit for the evaluation and management..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">{t('fieldCategory')}</Label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-bg-2 border border-border/30 rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="modifiersInput">{t('fieldModifiers')} <span className="text-text-muted text-xs font-normal">{t('fieldModifiersSub')}</span></Label>
              <Input id="modifiersInput" value={modifiersInput} onChange={(e) => setModifiersInput(e.target.value)} placeholder="-25, -59, -76" />
            </div>
          </div>

          <div>
            <Label htmlFor="bundlingNotes">{t('fieldBundlingNotes')}</Label>
            <textarea
              id="bundlingNotes"
              value={bundlingNotes ?? ''}
              onChange={(e) => setBundlingNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border/30 rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="No se puede facturar junto con 97140. Requiere modifier -25 si se factura con E&M."
            />
          </div>

          <div>
            <Label htmlFor="notes">{t('fieldInternalNotes')}</Label>
            <textarea
              id="notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border/30 rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="Notas operativas privadas..."
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">{t('checkboxActive')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isInternalOnly} onChange={(e) => setIsInternalOnly(e.target.checked)} disabled={type === 'CUSTOM_PM'} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">
                {t('checkboxInternalOnly')}
                {type === 'CUSTOM_PM' && <span className="text-text-muted ml-1">{t('checkboxAutoCustomPm')}</span>}
              </span>
            </label>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : editing ? tc('saveChanges') : t('dialogCreateBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ service, onClose, onEdit }: { service: Service | null; onClose: () => void; onEdit: () => void }) {
  const t = useTranslations('phoenix.services');
  const tc = useTranslations('phoenix.common');

  if (!service) return null;
  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <code className="text-text-1 font-mono font-bold text-xl">{service.code}</code>
            <TypePill type={service.type} />
            {service.isFavorite && <Star className="w-5 h-5 fill-amber text-amber" />}
          </DialogTitle>
          <DialogDescription>{service.shortDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4 text-sm">
          {service.longDescription && (
            <div className="bg-bg-2 rounded-md p-3 text-text-2 text-xs leading-relaxed">{service.longDescription}</div>
          )}
          <InfoRow label={t('infoFee')}       value={<span className="text-emerald font-mono font-bold">${service.currentFee.toFixed(2)}</span>} />
          <InfoRow label={t('fieldCategory')} value={<CategoryPill cat={service.category} />} />
          <InfoRow label={t('fieldFiscalYear')} value={<span className="font-mono">{service.fiscalYear}</span>} />
          <InfoRow label={t('columnModifiers')}
            value={service.modifiersAllowed.length === 0 ? <Empty /> : (
              <div className="flex flex-wrap gap-1">
                {service.modifiersAllowed.map((m) => (
                  <code key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-2 border border-border/30 text-text-2">{m}</code>
                ))}
              </div>
            )} />
          {service.bundlingNotes && (
            <InfoRow label={t('infoBundling')} value={<div className="text-text-2 text-xs whitespace-pre-wrap">{service.bundlingNotes}</div>} />
          )}
          <InfoRow label={tc('status')}       value={service.isActive ? <span className="text-emerald">{t('statusActive')}</span> : <span className="text-text-muted">{t('statusInactive')}</span>} />
          <InfoRow label={t('infoFacturable')} value={service.isInternalOnly ? <span className="text-amber">{t('infoInternalOnly')}</span> : <span className="text-emerald">{t('infoYesBillable')}</span>} />
          {service.notes && (
            <InfoRow label={tc('notes')} value={<div className="text-text-2 text-xs whitespace-pre-wrap">{service.notes}</div>} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc('close')}</Button>
          <Button onClick={onEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> {tc('edit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start py-1.5 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-xs uppercase tracking-wider font-semibold">{label}</div>
      <div className="col-span-2">{value}</div>
    </div>
  );
}

function Empty() { return <span className="text-text-muted italic">—</span>; }

function DeleteConfirmDialog({
  service, onClose, onConfirmed,
}: {
  service: Service | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const t = useTranslations('phoenix.services');
  const tc = useTranslations('phoenix.common');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!service) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/services?id=${service.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorDelete'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">{t('deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('deleteDesc', { code: service.code, description: service.shortDescription })}
          </DialogDescription>
        </DialogHeader>
        {error && <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>{tc('cancel')}</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? tc('deleting') : (<><Trash2 className="w-3.5 h-3.5 mr-1" /> {tc('delete')}</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
