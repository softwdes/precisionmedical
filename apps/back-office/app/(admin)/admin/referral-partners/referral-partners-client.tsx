'use client';

/**
 * Catálogo de referidores — quiroprácticos, centros de accidente, otras
 * clínicas. Todo el que nos manda pacientes y no es un bufete (esos tienen su
 * propio catálogo) ni personal propio (ese es Providers).
 *
 * ── Por qué tiene "Fusionar" y los otros catálogos no ──────────────────────
 *
 * Este nace cargado con lo que se escribió durante años sin lista, así que
 * arranca con duplicados reales: "Axcess", "Axcess Referral" y "Axcess AF
 * Referral" son el mismo lugar. Borrar uno no alcanza —el borrado deja los
 * vínculos intactos a propósito— así que sin fusionar, el conteo de pacientes
 * quedaría partido para siempre entre dos filas.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Pencil, Trash2, Plus, Search as SearchIcon, Phone, Merge, Users, AlertTriangle,
} from 'lucide-react';
import {
  Button, Input, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, Label,
} from '@precision/ui';
import {
  PageHeader, KpiCard, FilterPill, IconAction, StatusPill,
  DataTable, TableFooter, EmptyState,
} from '@/components/ui-phoenix';

export const TIPOS_REFERIDOR = ['CHIROPRACTOR', 'ACCIDENT_CENTER', 'MEDICAL_PROVIDER', 'OTHER'] as const;
export type TipoReferidor = (typeof TIPOS_REFERIDOR)[number];

export interface ReferralPartner {
  id: string;
  type: TipoReferidor;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  status: string;
  /** Pacientes que lo declaran como quien los refirió. */
  patientCount: number;
  /** Casos donde la clínica lo reconoce como el quiropráctico tratante. */
  caseCount: number;
}

interface Props {
  partners: ReferralPartner[];
  stats: {
    total: number;
    active: number;
    chiropractors: number;
    /** Sin teléfono no se le puede agradecer ni pedir el récord. */
    noPhone: number;
  };
}

export function ReferralPartnersClient({ partners, stats }: Props) {
  const router = useRouter();
  const t  = useTranslations('phoenix.referralPartners');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [search, setSearch]   = useState('');
  const [type, setType]       = useState<'' | TipoReferidor>('');
  const [filter, setFilter]   = useState<'all' | 'noPhone' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<ReferralPartner | null>(null);
  const [deleting, setDeleting] = useState<ReferralPartner | null>(null);
  const [merging, setMerging]   = useState<ReferralPartner | null>(null);

  const filtered = partners.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const haystack = [p.name, p.contactName ?? '', p.city ?? '', p.phone ?? '', p.email ?? ''];
      if (!haystack.some((h) => h.toLowerCase().includes(q))) return false;
    }
    if (type && p.type !== type) return false;
    if (filter === 'noPhone'  && p.phone) return false;
    if (filter === 'inactive' && p.status === 'ACTIVE') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { active: stats.active })}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}    value={stats.total}         sub={t('kpiTotalSub')}    color="text-text-1" />
        <KpiCard label={t('kpiActive')}   value={stats.active}        sub={t('kpiActiveSub')}   color="text-emerald" />
        <KpiCard label={t('kpiChiros')}   value={stats.chiropractors} sub={t('kpiChirosSub')}   color="text-brand-text" />
        <KpiCard label={t('kpiNoPhone')}  value={stats.noPhone}       sub={t('kpiNoPhoneSub')}
                 color={stats.noPhone > 0 ? 'text-amber' : 'text-text-muted'} />
      </div>

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
          value={type}
          onChange={(e) => setType(e.target.value as '' | TipoReferidor)}
          className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
        >
          <option value="">{t('allTypes')}</option>
          {TIPOS_REFERIDOR.map((x) => <option key={x} value={x}>{t(`type_${x}`)}</option>)}
        </select>
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label={t('filterAll')}      count={stats.total} />
        <FilterPill active={filter === 'noPhone'}  onClick={() => setFilter('noPhone')}  label={t('filterNoPhone')}  count={stats.noPhone} />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filterInactive')} count={stats.total - stats.active} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('columnPartner')}</DataTable.Th>
              <DataTable.Th>{t('columnType')}</DataTable.Th>
              <DataTable.Th>{t('columnPhone')}</DataTable.Th>
              <DataTable.Th>{t('columnCity')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnSent')}</DataTable.Th>
              <DataTable.Th align="center">{tc('status')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={7}>
                    <EmptyState.Inline
                      message={search || type || filter !== 'all' ? t('emptyFiltered') : t('emptyFirst')}
                    />
                  </DataTable.Td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <DataTable.Row
                    key={p.id}
                    muted={p.status !== 'ACTIVE'}
                    highlight={!p.phone}
                    highlightClass="bg-amber/[0.03]"
                  >
                    <DataTable.Td sticky="left">
                      <div className="min-w-0">
                        <div className="text-text-1 font-semibold truncate flex items-center gap-1">
                          {p.name}
                          {!p.phone && <AlertTriangle className="w-3 h-3 text-amber shrink-0" />}
                        </div>
                        {p.contactName && (
                          <div className="text-text-muted text-[11px] truncate">{p.contactName}</div>
                        )}
                      </div>
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className="text-text-2">{t(`type_${p.type}`)}</span>
                    </DataTable.Td>
                    <DataTable.Td>
                      {p.phone ? (
                        <span className="flex items-center gap-1.5 text-text-2 text-xs font-mono">
                          <Phone className="w-3 h-3 text-text-muted shrink-0" />{p.phone}
                        </span>
                      ) : <Empty />}
                    </DataTable.Td>
                    <DataTable.Td>
                      {p.city ? <span className="text-text-2">{p.city}</span> : <Empty />}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      {/* Lo que este catálogo existe para poder contestar: a quién
                          hay que agradecerle, y cuánto. */}
                      {p.patientCount + p.caseCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-text-1 font-semibold"
                          title={t('sentHint', { patients: p.patientCount, cases: p.caseCount })}
                        >
                          <Users className="w-3 h-3 text-text-muted" />
                          {p.patientCount + p.caseCount}
                        </span>
                      ) : <Empty />}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <StatusPill
                        state={p.status === 'ACTIVE' ? 'active' : 'inactive'}
                        label={p.status === 'ACTIVE' ? t('statusActive') : t('statusInactive')}
                      />
                    </DataTable.Td>
                    <DataTable.Td align="right" sticky="right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setEditing(p)}  icon={Pencil} label={tc('edit')} />
                        <IconAction onClick={() => setMerging(p)}  icon={Merge}  label={t('mergeAction')} />
                        <IconAction onClick={() => setDeleting(p)} icon={Trash2} label={tc('delete')} variant="danger" />
                      </div>
                    </DataTable.Td>
                  </DataTable.Row>
                ))
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

      <PartnerDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
      />

      <MergeDialog
        from={merging}
        partners={partners}
        onClose={() => setMerging(null)}
        onMerged={() => { setMerging(null); refresh(); }}
      />

      <DeleteConfirmDialog
        partner={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

function Empty() {
  return <span className="text-text-muted italic">—</span>;
}

// ─── Alta / edición ──────────────────────────────────────────────────────────

export function PartnerDialog({
  open, onOpenChange, editing, initialName, tipoInicial, onSaved, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ReferralPartner | null;
  /** Precarga el nombre con lo que se venía buscando (alta desde un selector). */
  initialName?: string;
  /** Tipo con el que abre el alta cuando la dispara un campo que ya lo sabe. */
  tipoInicial?: TipoReferidor;
  onSaved?: () => void;
  /** Alta desde un selector: devuelve el creado para dejarlo elegido. */
  onCreated?: (partner: { id: string; name: string; type: TipoReferidor }) => void;
}) {
  const t  = useTranslations('phoenix.referralPartners');
  const tc = useTranslations('phoenix.common');
  const [type, setType]       = useState<TipoReferidor>(editing?.type ?? tipoInicial ?? 'CHIROPRACTOR');
  const [name, setName]       = useState(editing?.name ?? initialName ?? '');
  const [contactName, setContactName] = useState(editing?.contactName ?? '');
  const [phone, setPhone]     = useState(editing?.phone ?? '');
  const [email, setEmail]     = useState(editing?.email ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [city, setCity]       = useState(editing?.city ?? '');
  const [notes, setNotes]     = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState((editing?.status ?? 'ACTIVE') === 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Mismo patrón que los demás catálogos: resetea al cambiar el registro que se
  // edita, sin useEffect.
  const editingId = editing?.id ?? initialName ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setType(editing?.type ?? tipoInicial ?? 'CHIROPRACTOR');
    setName(editing?.name ?? initialName ?? '');
    setContactName(editing?.contactName ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setAddress(editing?.address ?? '');
    setCity(editing?.city ?? '');
    setNotes(editing?.notes ?? '');
    setIsActive((editing?.status ?? 'ACTIVE') === 'ACTIVE');
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (name.trim().length < 2) return setError(t('errName'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/referral-partners', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          type,
          name: name.trim(),
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          notes: notes.trim() || null,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      onCreated?.(data.partner);
      onSaved?.();
      onOpenChange(false);
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
              <Label htmlFor="rp-name">{t('fieldName')} <span className="text-rose">*</span></Label>
              <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fieldNamePh')} autoFocus />
            </div>
            <div>
              <Label htmlFor="rp-type">{t('fieldType')}</Label>
              <select
                id="rp-type"
                value={type}
                onChange={(e) => setType(e.target.value as TipoReferidor)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {TIPOS_REFERIDOR.map((x) => <option key={x} value={x}>{t(`type_${x}`)}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-text-2 text-xs uppercase tracking-wider font-semibold mb-2">{t('groupContact')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rp-contact">{t('fieldContact')}</Label>
                <Input id="rp-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t('fieldContactPh')} />
              </div>
              <div>
                <Label htmlFor="rp-phone">{t('fieldPhone')}</Label>
                <Input id="rp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(385) 000-0000" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Label htmlFor="rp-email">{t('fieldEmail')}</Label>
                <Input id="rp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="front@..." />
              </div>
              <div>
                <Label htmlFor="rp-city">{t('fieldCity')}</Label>
                <Input id="rp-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Provo" />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="rp-address">{t('fieldAddress')}</Label>
              <Input id="rp-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <Label htmlFor="rp-notes">{t('fieldNotes')}</Label>
            <textarea
              id="rp-notes"
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

// ─── Fusionar ────────────────────────────────────────────────────────────────

function MergeDialog({
  from, partners, onClose, onMerged,
}: {
  from: ReferralPartner | null;
  partners: ReferralPartner[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const t  = useTranslations('phoenix.referralPartners');
  const tc = useTranslations('phoenix.common');
  const [intoId, setIntoId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fromId = from?.id ?? null;
  const [lastFromId, setLastFromId] = useState<string | null>(null);
  if (from && fromId !== lastFromId) {
    setIntoId('');
    setError(null);
    setLastFromId(fromId);
  }

  if (!from) return null;

  const candidatos = partners.filter((p) => p.id !== from.id && p.status === 'ACTIVE');

  const handleMerge = async () => {
    setError(null);
    if (!intoId) return setError(t('errMergeTarget'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/referral-partners/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: from.id, intoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!from} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mergeTitle', { name: from.name })}</DialogTitle>
          <DialogDescription>
            {t('mergeDescription', { name: from.name, count: from.patientCount + from.caseCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="rp-merge">{t('mergeInto')}</Label>
            <select
              id="rp-merge"
              value={intoId}
              onChange={(e) => setIntoId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              <option value="">{t('mergeSelect')}</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-muted">{t('mergeHint')}</p>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>{tc('cancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={handleMerge} disabled={saving || !intoId}>
            {saving ? tc('saving') : (<><Merge className="w-3.5 h-3.5 mr-1" /> {t('mergeAction')}</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Borrar ──────────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  partner, onClose, onConfirmed,
}: {
  partner: ReferralPartner | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const t  = useTranslations('phoenix.referralPartners');
  const tc = useTranslations('phoenix.common');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!partner) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/referral-partners?id=${partner.id}`, { method: 'DELETE' });
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
    <Dialog open={!!partner} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">{t('deleteTitle')}</DialogTitle>
          <DialogDescription>{t('deleteDescription', { name: partner.name })}</DialogDescription>
        </DialogHeader>

        {/* Borrar NO desengancha a nadie: quien ya lo señalaba lo sigue
            señalando. Si lo que se quiere es juntar dos filas, es "Fusionar". */}
        {partner.patientCount + partner.caseCount > 0 && (
          <div className="text-amber text-xs bg-amber/10 border border-amber/30 rounded-md px-3 py-2">
            {t('deleteKeepsLinks', { count: partner.patientCount + partner.caseCount })}
          </div>
        )}

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
