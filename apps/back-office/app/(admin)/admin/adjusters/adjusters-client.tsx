'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Pencil, Trash2, Plus, Search as SearchIcon, Phone, Printer, AlertTriangle,
} from 'lucide-react';
import {
  Button, Input, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, Label,
} from '@precision/ui';
import {
  PageHeader, KpiCard, FilterPill, IconAction, StatusPill,
  DataTable, TableFooter, EmptyState, EntityAvatar,
} from '@/components/ui-phoenix';

// Catálogo de ajustadores — paso 1 de la vista de tracking de Edson.
// Ver docs/plan-vista-edson.md §3.2

export interface Adjuster {
  id: string;
  insuranceCarrierId: string;
  name: string;
  phone: string | null;
  extension: string | null;
  phone2: string | null;
  fax: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  carrier: { id: string; name: string; shortCode: string; color: string } | null;
}

export interface AdjusterCarrier {
  id: string;
  name: string;
  shortCode: string;
  color: string;
}

interface Props {
  adjusters: Adjuster[];
  carriers: AdjusterCarrier[];
  stats: {
    total: number;
    active: number;
    carriersCovered: number;
    noPhone: number;
  };
}

/** El teléfono y la extensión se guardan aparte pero se leen juntos. */
function formatPhone(phone: string | null, extension: string | null): string | null {
  if (!phone) return null;
  return extension ? `${phone} ext. ${extension}` : phone;
}

export function AdjustersClient({ adjusters, carriers, stats }: Props) {
  const router = useRouter();
  const t  = useTranslations('phoenix.adjusters');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'noPhone' | 'inactive'>('all');
  const [carrierId, setCarrierId] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<Adjuster | null>(null);
  const [deleting, setDeleting] = useState<Adjuster | null>(null);

  const filtered = adjusters.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      const haystack = [a.name, a.carrier?.name ?? '', a.email ?? '', a.phone ?? '', a.phone2 ?? ''];
      if (!haystack.some((h) => h.toLowerCase().includes(q))) return false;
    }
    if (carrierId && a.insuranceCarrierId !== carrierId) return false;
    if (filter === 'noPhone'  && (a.phone || a.phone2)) return false;
    if (filter === 'inactive' && a.status === 'ACTIVE') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { active: stats.active, carriers: stats.carriersCovered })}
        action={
          <Button onClick={() => setCreateOpen(true)} disabled={carriers.length === 0}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}    value={stats.total}           sub={t('kpiTotalSub')}    color="text-text-1" />
        <KpiCard label={t('kpiActive')}   value={stats.active}          sub={t('kpiActiveSub')}   color="text-emerald" />
        <KpiCard label={t('kpiCarriers')} value={stats.carriersCovered} sub={t('kpiCarriersSub')} color="text-brand-text" />
        <KpiCard label={t('kpiNoPhone')}  value={stats.noPhone}         sub={t('kpiNoPhoneSub')}
                 color={stats.noPhone > 0 ? 'text-amber' : 'text-text-muted'} />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={carrierId}
          onChange={(e) => setCarrierId(e.target.value)}
          className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
        >
          <option value="">{t('allCarriers')}</option>
          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label={t('filterAll')}      count={stats.total} />
        <FilterPill active={filter === 'noPhone'}  onClick={() => setFilter('noPhone')}  label={t('filterNoPhone')}  count={stats.noPhone} />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filterInactive')} count={stats.total - stats.active} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('columnAdjuster')}</DataTable.Th>
              <DataTable.Th>{t('columnCarrier')}</DataTable.Th>
              <DataTable.Th>{t('columnPhone')}</DataTable.Th>
              <DataTable.Th>{t('columnAlternate')}</DataTable.Th>
              <DataTable.Th align="center">{tc('status')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={6}>
                    <EmptyState.Inline
                      message={
                        search || carrierId || filter !== 'all'
                          ? t('emptyFiltered')
                          : t('emptyFirst')
                      }
                    />
                  </DataTable.Td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const noPhone = !a.phone && !a.phone2;
                  return (
                    <DataTable.Row
                      key={a.id}
                      muted={a.status !== 'ACTIVE'}
                      highlight={noPhone}
                      highlightClass="bg-amber/[0.03]"
                    >
                      <DataTable.Td sticky="left">
                        <div className="min-w-0">
                          <div className="text-text-1 font-semibold truncate flex items-center gap-1">
                            {a.name}
                            {noPhone && <AlertTriangle className="w-3 h-3 text-amber shrink-0" />}
                          </div>
                          {a.email && (
                            <div className="text-text-muted text-[11px] truncate" title={a.email}>{a.email}</div>
                          )}
                        </div>
                      </DataTable.Td>
                      <DataTable.Td>
                        {a.carrier ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <EntityAvatar code={a.carrier.shortCode} color={a.carrier.color} size={6} />
                            <span className="text-text-2 truncate">{a.carrier.name}</span>
                          </div>
                        ) : <Empty />}
                      </DataTable.Td>
                      <DataTable.Td>
                        {formatPhone(a.phone, a.extension)
                          ? (
                            <span className="flex items-center gap-1.5 text-text-2 text-xs font-mono">
                              <Phone className="w-3 h-3 text-text-muted shrink-0" />
                              {formatPhone(a.phone, a.extension)}
                            </span>
                          )
                          : <Empty />}
                      </DataTable.Td>
                      <DataTable.Td>
                        <div className="text-text-muted text-xs space-y-0.5">
                          {a.phone2 && (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Phone className="w-3 h-3 shrink-0" />{a.phone2}
                            </div>
                          )}
                          {a.fax && (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Printer className="w-3 h-3 shrink-0" />{a.fax}
                            </div>
                          )}
                          {!a.phone2 && !a.fax && <Empty />}
                        </div>
                      </DataTable.Td>
                      <DataTable.Td align="center">
                        <StatusPill
                          state={a.status === 'ACTIVE' ? 'active' : 'inactive'}
                          label={a.status === 'ACTIVE' ? t('statusActive') : t('statusInactive')}
                        />
                      </DataTable.Td>
                      <DataTable.Td align="right" sticky="right">
                        <div className="flex items-center justify-end gap-1">
                          <IconAction onClick={() => setEditing(a)}  icon={Pencil} label={tc('edit')} />
                          <IconAction onClick={() => setDeleting(a)} icon={Trash2} label={tc('delete')} variant="danger" />
                        </div>
                      </DataTable.Td>
                    </DataTable.Row>
                  );
                })
              )}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={t('footerLeft', { shown: filtered.length, total: stats.total })}
          right={
            <span className="flex items-center gap-4">
              <span>{t('footerActive')}: <strong className="text-emerald">{stats.active}</strong></span>
              <span>{t('footerNoPhone')}: <strong className={stats.noPhone > 0 ? 'text-amber' : 'text-text-2'}>{stats.noPhone}</strong></span>
            </span>
          }
        />
      </DataTable.Card>

      <AdjusterDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        carriers={carriers}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
      />

      <DeleteConfirmDialog
        adjuster={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

function Empty() {
  return <span className="text-text-muted italic">—</span>;
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function AdjusterDialog({
  open, onOpenChange, editing, carriers, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Adjuster | null;
  carriers: AdjusterCarrier[];
  onSaved: () => void;
}) {
  const t  = useTranslations('phoenix.adjusters');
  const tc = useTranslations('phoenix.common');
  const [insuranceCarrierId, setCarrier] = useState(editing?.insuranceCarrierId ?? carriers[0]?.id ?? '');
  const [name, setName]           = useState(editing?.name ?? '');
  const [phone, setPhone]         = useState(editing?.phone ?? '');
  const [extension, setExtension] = useState(editing?.extension ?? '');
  const [phone2, setPhone2]       = useState(editing?.phone2 ?? '');
  const [fax, setFax]             = useState(editing?.fax ?? '');
  const [email, setEmail]         = useState(editing?.email ?? '');
  const [notes, setNotes]         = useState(editing?.notes ?? '');
  const [isActive, setIsActive]   = useState((editing?.status ?? 'ACTIVE') === 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Mismo patrón que InsurancesClient: resetea el formulario cuando cambia el
  // registro que se está editando, sin useEffect.
  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setCarrier(editing?.insuranceCarrierId ?? carriers[0]?.id ?? '');
    setName(editing?.name ?? '');
    setPhone(editing?.phone ?? '');
    setExtension(editing?.extension ?? '');
    setPhone2(editing?.phone2 ?? '');
    setFax(editing?.fax ?? '');
    setEmail(editing?.email ?? '');
    setNotes(editing?.notes ?? '');
    setIsActive((editing?.status ?? 'ACTIVE') === 'ACTIVE');
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!insuranceCarrierId) return setError(t('errCarrier'));
    if (name.trim().length < 2) return setError(t('errName'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/adjusters', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          insuranceCarrierId,
          name: name.trim(),
          phone: phone.trim() || null,
          extension: extension.trim() || null,
          phone2: phone2.trim() || null,
          fax: fax.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('dialogEdit', { name: editing.name }) : t('dialogNew')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="adj-name">{t('fieldName')} <span className="text-rose">*</span></Label>
              <Input id="adj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fieldNamePh')} autoFocus />
            </div>
            <div>
              <Label htmlFor="adj-carrier">{t('fieldCarrier')} <span className="text-rose">*</span></Label>
              <select
                id="adj-carrier"
                value={insuranceCarrierId}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-text-2 text-xs uppercase tracking-wider font-semibold mb-2">{t('groupContact')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="adj-phone">{t('fieldPhone')}</Label>
                <Input id="adj-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(385) 275-3321" />
              </div>
              <div>
                <Label htmlFor="adj-ext">{t('fieldExtension')}</Label>
                <Input id="adj-ext" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="3853" maxLength={20} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Label htmlFor="adj-phone2">{t('fieldPhone2')}</Label>
                <Input id="adj-phone2" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="(800) 000-0000" />
              </div>
              <div>
                <Label htmlFor="adj-fax">{t('fieldFax')}</Label>
                <Input id="adj-fax" value={fax} onChange={(e) => setFax(e.target.value)} placeholder="(866) 000-0000" />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="adj-email">{t('fieldEmail')}</Label>
              <Input id="adj-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="claims@..." />
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <Label htmlFor="adj-notes">{t('fieldNotes')}</Label>
            <textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder={t('fieldNotesPh')}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
            <span className="text-sm text-text-2">{t('activeToggle')}</span>
          </label>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : editing ? tc('saveChanges') : t('createButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  adjuster, onClose, onConfirmed,
}: {
  adjuster: Adjuster | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const t  = useTranslations('phoenix.adjusters');
  const tc = useTranslations('phoenix.common');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!adjuster) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/adjusters?id=${adjuster.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errDelete'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!adjuster} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">{t('deleteTitle')}</DialogTitle>
          <DialogDescription>{t('deleteDescription', { name: adjuster.name })}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={deleting}>{tc('cancel')}</Button>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
            {deleting ? tc('deleting') : (<><Trash2 className="w-3.5 h-3.5 mr-1" /> {tc('delete')}</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
