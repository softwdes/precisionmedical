'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, Star, Trash2, Plus, Search as SearchIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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

interface Diagnosis {
  id: string;
  icd10Code: string;
  icd10Description: string;
  snomedCode: string | null;
  snomedDescription: string | null;
  category: string;
  bodySystem: string | null;
  piRelevant: boolean;
  isActive: boolean;
  isFavorite: boolean;
}

interface Props {
  stats: {
    total: number;
    active: number;
    piRelevant: number;
    withSnomed: number;
    favorites: number;
  };
  userId?: string;
}

const PAGE_SIZE = 50;

export function DiagnosesClient({ stats, userId = '' }: Props) {
  const t  = useTranslations('phoenix.diagnoses');
  const tc = useTranslations('phoenix.common');

  const CATEGORY_OPTIONS = [
    { value: 'S',     label: t('catS') },
    { value: 'T',     label: t('catT') },
    { value: 'M',     label: t('catM') },
    { value: 'R',     label: t('catR') },
    { value: 'G',     label: t('catG') },
    { value: 'F',     label: t('catF') },
    { value: 'V_W',   label: t('catVW') },
    { value: 'Z',     label: t('catZ') },
    { value: 'OTHER', label: t('catOther') },
  ];

  const [rows, setRows]           = useState<Diagnosis[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'favorites' | 'piRelevant'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]     = useState<Diagnosis | null>(null);
  const [viewing, setViewing]     = useState<Diagnosis | null>(null);
  const [deleting, setDeleting]   = useState<Diagnosis | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, q: string, f: string, cat: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q, filter: f, category: cat, page: String(p), limit: String(PAGE_SIZE),
        ...(userId ? { userId } : {}),
      });
      const r = await fetch(`/api/admin/diagnoses?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRows(data.diagnoses ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(1, '', 'all', 'all'); }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, search, filter, categoryFilter);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function applyFilter(f: typeof filter) {
    setFilter(f);
    setPage(1);
    load(1, search, f, categoryFilter);
  }

  function applyCategory(cat: string) {
    setCategoryFilter(cat);
    setPage(1);
    load(1, search, filter, cat);
  }

  function goPage(p: number) {
    setPage(p);
    load(p, search, filter, categoryFilter);
  }

  const refresh = () => load(page, search, filter, categoryFilter);

  const toggleFavorite = async (dx: Diagnosis) => {
    await fetch(`/api/admin/diagnoses/${dx.id}/favorite`, {
      method: dx.isFavorite ? 'DELETE' : 'POST',
    });
    refresh();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { piRelevant: stats.piRelevant, favorites: stats.favorites, mockup: 'Mockup B.35' })}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}       value={stats.total}      sub="Catalog"           color="text-text-1" />
        <KpiCard label={t('kpiPiRelevant')}  value={stats.piRelevant} sub="MVA cases"         color="text-rose" />
        <KpiCard label={t('kpiWithSnomed')}  value={stats.withSnomed} sub="Dual complete"     color="text-emerald" />
        <KpiCard label={t('kpiFavorites')}   value={stats.favorites}  sub="B.18 autocomplete" color="text-amber" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder={tc('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FilterPill active={filter === 'all'}        onClick={() => applyFilter('all')}        label={t('filterAll')}        count={stats.total} />
          <FilterPill active={filter === 'favorites'}  onClick={() => applyFilter('favorites')}  label={t('filterFavorites')}  count={stats.favorites} />
          <FilterPill active={filter === 'piRelevant'} onClick={() => applyFilter('piRelevant')} label={t('filterPiRelevant')} count={stats.piRelevant} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-text-muted">{t('categoryLabel')}</Label>
          <select
            value={categoryFilter}
            onChange={(e) => applyCategory(e.target.value)}
            className="bg-bg-2 border border-border rounded-md px-3 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand"
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
              <DataTable.Th>ICD-10 (billing)</DataTable.Th>
              <DataTable.Th>SNOMED CT (clínico)</DataTable.Th>
              <DataTable.Th align="center">Cat.</DataTable.Th>
              <DataTable.Th>Body system</DataTable.Th>
              <DataTable.Th align="center">PI</DataTable.Th>
              <DataTable.Th align="right">{t('columnActions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">{t('loadingText')}</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={7}>
                    <EmptyState.Inline
                      message={search ? t('emptySearch', { query: search }) : t('emptyDefault')}
                    />
                  </DataTable.Td>
                </tr>
              ) : rows.map((d) => (
                <DataTable.Row key={d.id} muted={!d.isActive} highlight={d.isFavorite}>
                  <DataTable.Td align="center" className="px-2">
                    <button type="button" onClick={() => toggleFavorite(d)} className="hover:scale-125 transition-transform" title={d.isFavorite ? t('favRemove') : t('favAdd')}>
                      <Star className={`w-4 h-4 ${d.isFavorite ? 'fill-amber text-amber' : 'text-text-muted/40'}`} />
                    </button>
                  </DataTable.Td>
                  <DataTable.Td>
                    <code className="text-brand font-mono font-bold text-sm">{d.icd10Code}</code>
                    <div className="text-text-1 text-[12.5px] mt-0.5 line-clamp-1" title={d.icd10Description}>{d.icd10Description}</div>
                  </DataTable.Td>
                  <DataTable.Td>
                    {d.snomedCode ? (
                      <>
                        <code className="text-emerald font-mono font-bold text-sm">{d.snomedCode}</code>
                        <div className="text-text-2 text-[12.5px] mt-0.5 line-clamp-1" title={d.snomedDescription ?? ''}>{d.snomedDescription}</div>
                      </>
                    ) : (
                      <span className="text-text-muted italic text-xs">{t('noSnomedMapping')}</span>
                    )}
                  </DataTable.Td>
                  <DataTable.Td align="center">
                    <CategoryPill cat={d.category} />
                  </DataTable.Td>
                  <DataTable.Td className="text-text-2 text-xs">
                    {d.bodySystem ?? <span className="text-text-muted italic">—</span>}
                  </DataTable.Td>
                  <DataTable.Td align="center">
                    {d.piRelevant ? (
                      <TagPill label="🩸 PI" colorClass="bg-rose/15 text-rose border-rose/30" />
                    ) : (
                      <span className="text-text-muted text-[10px]">—</span>
                    )}
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconAction onClick={() => setViewing(d)}  icon={Eye}    label={t('actionView')} />
                      <IconAction onClick={() => setEditing(d)}  icon={Pencil} label={tc('edit')} />
                      <IconAction onClick={() => setDeleting(d)} icon={Trash2} label={tc('delete')} variant="danger" />
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={
            <div className="flex items-center gap-3">
              <span>{t('paginationInfo', { total: total.toLocaleString(), page, totalPages: totalPages || 1 })}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="p-1 rounded hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="p-1 rounded hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          }
          right={<span className="text-text-muted">ICD-10: CDC · SNOMED CT: NLM/UMLS</span>}
        />
      </DataTable.Card>

      <DiagnosisDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
        categoryOptions={CATEGORY_OPTIONS}
      />

      <ViewDialog
        diagnosis={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); }}
      />

      <DeleteConfirmDialog
        diagnosis={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

// ─── Domain pills ────────────────────────────────────────────────────────────

function CategoryPill({ cat }: { cat: string }) {
  const colors: Record<string, string> = {
    S: 'bg-rose/15 text-rose border-rose/30',
    T: 'bg-rose/15 text-rose border-rose/30',
    M: 'bg-amber/15 text-amber border-amber/30',
    R: 'bg-brand/15 text-brand border-brand/30',
    G: 'bg-violet/15 text-violet border-violet/30',
    F: 'bg-pink/15 text-pink border-pink/30',
    V_W: 'bg-cyan/15 text-cyan border-cyan/30',
    Z: 'bg-emerald/15 text-emerald border-emerald/30',
    OTHER: 'bg-white/5 text-text-2 border-border',
  };
  return <TagPill label={cat} colorClass={colors[cat] ?? colors.OTHER} mono compact />;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function DiagnosisDialog({ open, onOpenChange, editing, onSaved, categoryOptions }: { open: boolean; onOpenChange: (open: boolean) => void; editing: Diagnosis | null; onSaved: () => void; categoryOptions: { value: string; label: string }[] }) {
  const t  = useTranslations('phoenix.diagnoses');
  const tc = useTranslations('phoenix.common');

  const [icd10Code, setIcd10Code]               = useState(editing?.icd10Code ?? '');
  const [icd10Description, setIcd10Description] = useState(editing?.icd10Description ?? '');
  const [snomedCode, setSnomedCode]             = useState(editing?.snomedCode ?? '');
  const [snomedDescription, setSnomedDescription] = useState(editing?.snomedDescription ?? '');
  const [category, setCategory]                 = useState(editing?.category ?? 'M');
  const [bodySystem, setBodySystem]             = useState(editing?.bodySystem ?? '');
  const [piRelevant, setPiRelevant]             = useState(editing?.piRelevant ?? false);
  const [isActive, setIsActive]                 = useState(editing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setIcd10Code(editing?.icd10Code ?? '');
    setIcd10Description(editing?.icd10Description ?? '');
    setSnomedCode(editing?.snomedCode ?? '');
    setSnomedDescription(editing?.snomedDescription ?? '');
    setCategory(editing?.category ?? 'M');
    setBodySystem(editing?.bodySystem ?? '');
    setPiRelevant(editing?.piRelevant ?? false);
    setIsActive(editing?.isActive ?? true);
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!icd10Code.trim()) return setError(t('errorIcd10Required'));
    if (!icd10Description.trim()) return setError(t('errorDescRequired'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/diagnoses', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          icd10Code: icd10Code.trim().toUpperCase(),
          icd10Description: icd10Description.trim(),
          snomedCode: snomedCode.trim() || null,
          snomedDescription: snomedDescription.trim() || null,
          category,
          bodySystem: bodySystem.trim() || null,
          piRelevant,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc('error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('dialogEditTitle', { code: editing.icd10Code }) : t('newButton')}</DialogTitle>
          <DialogDescription>
            {t('dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="bg-brand/5 border border-brand/20 rounded-md p-3">
            <div className="text-brand text-xs font-semibold uppercase tracking-wider mb-2">{t('sectionIcd10')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="icd10Code">{t('fieldIcd10Code')} <span className="text-rose">*</span></Label>
                <Input id="icd10Code" value={icd10Code} onChange={(e) => setIcd10Code(e.target.value.toUpperCase())} placeholder="M54.2" autoFocus />
              </div>
              <div>
                <Label htmlFor="category">{t('fieldChapter')}</Label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                  {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="icd10Description">{t('fieldIcd10Desc')} <span className="text-rose">*</span></Label>
              <Input id="icd10Description" value={icd10Description} onChange={(e) => setIcd10Description(e.target.value)} placeholder="Cervicalgia" />
            </div>
          </div>

          <div className="bg-emerald/5 border border-emerald/20 rounded-md p-3">
            <div className="text-emerald text-xs font-semibold uppercase tracking-wider mb-2">{t('sectionSnomed')}</div>
            <div>
              <Label htmlFor="snomedCode">{t('fieldSnomedCode')}</Label>
              <Input id="snomedCode" value={snomedCode ?? ''} onChange={(e) => setSnomedCode(e.target.value)} placeholder="102554000" />
            </div>
            <div className="mt-3">
              <Label htmlFor="snomedDescription">{t('fieldSnomedDesc')}</Label>
              <Input id="snomedDescription" value={snomedDescription ?? ''} onChange={(e) => setSnomedDescription(e.target.value)} placeholder="Tenderness of spinous process" />
            </div>
          </div>

          <div>
            <Label htmlFor="bodySystem">{t('fieldBodySystem')}</Label>
            <Input id="bodySystem" value={bodySystem ?? ''} onChange={(e) => setBodySystem(e.target.value)} placeholder="Cervical spine, Lumbar spine, Head, etc." />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={piRelevant} onChange={(e) => setPiRelevant(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">{t('checkPiRelevant')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">{t('checkActive')}</span>
            </label>
          </div>

          {error && <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : editing ? t('btnSaveChanges') : t('btnCreateDiagnosis')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ diagnosis, onClose, onEdit }: { diagnosis: Diagnosis | null; onClose: () => void; onEdit: () => void }) {
  const t  = useTranslations('phoenix.diagnoses');
  const tc = useTranslations('phoenix.common');

  if (!diagnosis) return null;
  return (
    <Dialog open={!!diagnosis} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <code className="text-brand font-mono font-bold text-lg">{diagnosis.icd10Code}</code>
            <span className="text-text-1 text-base font-normal">{diagnosis.icd10Description}</span>
            {diagnosis.isFavorite && <Star className="w-5 h-5 fill-amber text-amber" />}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="bg-brand/5 border border-brand/20 rounded-md p-3">
            <div className="text-brand text-xs font-semibold uppercase tracking-wider mb-1.5">ICD-10 (billing)</div>
            <code className="text-brand font-mono font-bold text-base">{diagnosis.icd10Code}</code>
            <div className="text-text-2 text-sm mt-1">{diagnosis.icd10Description}</div>
          </div>
          {diagnosis.snomedCode && (
            <div className="bg-emerald/5 border border-emerald/20 rounded-md p-3">
              <div className="text-emerald text-xs font-semibold uppercase tracking-wider mb-1.5">SNOMED CT (clínico)</div>
              <code className="text-emerald font-mono font-bold text-base">{diagnosis.snomedCode}</code>
              <div className="text-text-2 text-sm mt-1">{diagnosis.snomedDescription}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label={t('fieldChapter')}    value={<CategoryPill cat={diagnosis.category} />} />
            <InfoRow label={t('fieldBodySystem')} value={diagnosis.bodySystem ?? <span className="text-text-muted italic">—</span>} />
            <InfoRow label={t('columnPi')}        value={diagnosis.piRelevant ? <span className="text-rose">🩸 {tc('yes')}</span> : <span className="text-text-2">{tc('no')}</span>} />
            <InfoRow label={t('fieldStatus')}     value={diagnosis.isActive ? <span className="text-emerald">{tc('statusActive')}</span> : <span className="text-text-muted">{tc('statusInactive')}</span>} />
          </div>
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
    <div className="py-1.5 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-text-1 mt-0.5">{value}</div>
    </div>
  );
}

function DeleteConfirmDialog({ diagnosis, onClose, onConfirmed }: { diagnosis: Diagnosis | null; onClose: () => void; onConfirmed: () => void }) {
  const t  = useTranslations('phoenix.diagnoses');
  const tc = useTranslations('phoenix.common');

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!diagnosis) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/diagnoses?id=${diagnosis.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc('error'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!diagnosis} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">{t('deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('deleteDesc', { code: diagnosis.icd10Code, desc: diagnosis.icd10Description })}
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
