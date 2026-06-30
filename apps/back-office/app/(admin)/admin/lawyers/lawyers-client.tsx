'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, KeyRound, Trash2, Plus, Search as SearchIcon, Phone, Mail, MapPin } from 'lucide-react';
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
  StatusPill,
  TagPill,
  DataTable,
  TableFooter,
  EmptyState,
  EntityAvatar,
} from '@/components/ui-phoenix';

// B.30 — Bufetes (lista)

interface Firm {
  id: string;
  firmName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  paymentSpeed: string | null;
  caseflowFlags: string[];
  status: string;
  memberCount: number;
  createdAt: Date;
}

interface Props {
  firms: Firm[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalMembers: number;
    slowPayers: number;
  };
}

export function LawyersClient({ firms, stats }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'slow'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<Firm | null>(null);
  const [deleting, setDeleting] = useState<Firm | null>(null);

  const filtered = firms.filter((f) => {
    if (search) {
      const q = search.toLowerCase();
      if (!f.firmName.toLowerCase().includes(q) && !(f.city ?? '').toLowerCase().includes(q)) return false;
    }
    if (filter === 'active'   && f.status !== 'ACTIVE') return false;
    if (filter === 'inactive' && f.status === 'ACTIVE') return false;
    if (filter === 'slow'     && f.paymentSpeed !== 'SLOW') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { active: stats.active, members: stats.totalMembers, mockup: 'Mockup B.30' })}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}   value={stats.total}        sub={t('kpiTotalSub')}   color="text-text-1" />
        <KpiCard label={t('kpiActive')}  value={stats.active}       sub={t('kpiActiveSub')}  color="text-emerald" />
        <KpiCard label={t('kpiSlow')}    value={stats.slowPayers}   sub={t('kpiSlowSub')}    color="text-amber" />
        <KpiCard label={t('kpiMembers')} value={stats.totalMembers} sub={t('kpiMembersSub')} color="text-brand" />
      </div>

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
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label={t('filterAll')}      count={stats.total} />
        <FilterPill active={filter === 'active'}   onClick={() => setFilter('active')}   label={t('filterActive')}   count={stats.active} />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filterInactive')} count={stats.inactive} />
        <FilterPill active={filter === 'slow'}     onClick={() => setFilter('slow')}     label={t('filterSlow')}     count={stats.slowPayers} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>{t('columnFirm')}</DataTable.Th>
              <DataTable.Th>{t('columnContact')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnMembers')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnPayment')}</DataTable.Th>
              <DataTable.Th>{t('columnFlags')}</DataTable.Th>
              <DataTable.Th align="center">{tc('status')}</DataTable.Th>
              <DataTable.Th align="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={7}>
                    <EmptyState.Inline
                      message={search ? `No hay bufetes que coincidan con "${search}"` : 'No hay bufetes. Crea el primero arriba.'}
                    />
                  </DataTable.Td>
                </tr>
              ) : (
                filtered.map((f) => (
                  <DataTable.Row key={f.id} muted={f.status !== 'ACTIVE'}>
                    <DataTable.Td>
                      <div className="flex items-center gap-3">
                        <EntityAvatar name={f.firmName} />
                        <div className="min-w-0">
                          <div className="text-text-1 font-semibold truncate">{f.firmName}</div>
                          {(f.city || f.state) && (
                            <div className="text-text-muted text-[11px] flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {[f.city, f.state].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </DataTable.Td>
                    <DataTable.Td>
                      <div className="text-text-2 text-xs space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-text-muted shrink-0" />
                          <span className="truncate max-w-[180px]" title={f.email ?? undefined}>{f.email ?? '—'}</span>
                        </div>
                        {f.phone && (
                          <div className="flex items-center gap-1.5 text-text-muted font-mono">
                            <Phone className="w-3 h-3 shrink-0" />
                            {f.phone}
                          </div>
                        )}
                      </div>
                    </DataTable.Td>
                    <DataTable.Td align="center" className="text-text-1 font-mono font-semibold">
                      {f.memberCount}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <PaymentSpeedPill speed={f.paymentSpeed} />
                    </DataTable.Td>
                    <DataTable.Td>
                      <div className="flex flex-wrap gap-1">
                        {f.caseflowFlags.length === 0 ? (
                          <span className="text-text-muted text-[10px] italic">—</span>
                        ) : (
                          f.caseflowFlags.map((flag) => (
                            <TagPill key={flag} label={flag} colorClass="bg-brand/10 text-brand border-brand/20" mono compact />
                          ))
                        )}
                      </div>
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <StatusPill
                        state={f.status === 'ACTIVE' ? 'active' : 'inactive'}
                        label={f.status === 'ACTIVE' ? 'Activo' : (f.status === 'INACTIVE' ? 'Inactivo' : f.status)}
                      />
                    </DataTable.Td>
                    <DataTable.Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/lawyers/${f.id}`} title="Ver detalle (B.31)">
                          <IconAction icon={Eye} label="Ver detalle" />
                        </Link>
                        <IconAction onClick={() => setEditing(f)}  icon={Pencil}   label="Editar" />
                        <IconAction onClick={() => { /* permissions tbd */ }} icon={KeyRound} label="Permisos" disabled />
                        <IconAction onClick={() => setDeleting(f)} icon={Trash2}   label="Eliminar" variant="danger" />
                      </div>
                    </DataTable.Td>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={`${filtered.length} de ${stats.total} bufetes`}
          right={<span className="font-mono">phoenix-dev · local</span>}
        />
      </DataTable.Card>

      <FirmDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
      />

      <DeleteConfirmDialog
        firm={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

// ─── Domain pills ───────────────────────────────────────────────────────────

/** PaymentSpeedPill — Pill custom para velocidad de pago del bufete.
 *  Usa TagPill del shared con color por dominio. */
function PaymentSpeedPill({ speed }: { speed: string | null }) {
  if (!speed || speed === 'UNKNOWN') {
    return <span className="text-text-muted text-[10px] italic">—</span>;
  }
  const colors: Record<string, string> = {
    FAST:    'bg-emerald/15 text-emerald border-emerald/30',
    AVERAGE: 'bg-cyan/15 text-cyan border-cyan/30',
    SLOW:    'bg-amber/15 text-amber border-amber/30',
  };
  const labels: Record<string, string> = {
    FAST:    '⚡ Rápido',
    AVERAGE: '~ Promedio',
    SLOW:    '⚠ Lento',
  };
  return <TagPill label={labels[speed] ?? speed} colorClass={colors[speed] ?? 'bg-white/5 text-text-2 border-border'} />;
}

// ─── Modals ─────────────────────────────────────────────────────────────────

const PAYMENT_SPEEDS = [
  { value: 'UNKNOWN', label: 'Desconocido (sin data aún)' },
  { value: 'FAST',    label: '⚡ Rápido (< 90 días)' },
  { value: 'AVERAGE', label: '~ Promedio (90-150 días)' },
  { value: 'SLOW',    label: '⚠ Lento (> 150 días)' },
];

function FirmDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Firm | null;
  onSaved: () => void;
}) {
  const [firmName, setFirmName] = useState(editing?.firmName ?? '');
  const [email, setEmail]       = useState(editing?.email ?? '');
  const [phone, setPhone]       = useState(editing?.phone ?? '');
  const [address, setAddress]   = useState(editing?.address ?? '');
  const [city, setCity]         = useState(editing?.city ?? '');
  const [state, setState]       = useState(editing?.state ?? 'UT');
  const [paymentSpeed, setPaymentSpeed] = useState(editing?.paymentSpeed ?? 'UNKNOWN');
  const [flagsInput, setFlagsInput]     = useState(editing?.caseflowFlags.join(', ') ?? '');
  const [notes, setNotes]   = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.status === 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setFirmName(editing?.firmName ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setAddress(editing?.address ?? '');
    setCity(editing?.city ?? '');
    setState(editing?.state ?? 'UT');
    setPaymentSpeed(editing?.paymentSpeed ?? 'UNKNOWN');
    setFlagsInput(editing?.caseflowFlags.join(', ') ?? '');
    setNotes(editing?.notes ?? '');
    setIsActive(editing?.status === 'ACTIVE');
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!firmName.trim()) return setError('El nombre del bufete es obligatorio');
    setSaving(true);
    try {
      const flags = flagsInput.split(',').map((f) => f.trim()).filter(Boolean);
      const res = await fetch('/api/admin/lawyers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          firmName: firmName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          paymentSpeed,
          caseflowFlags: flags,
          notes: notes.trim() || null,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar — ${editing.firmName}` : 'Nuevo bufete'}</DialogTitle>
          <DialogDescription>
            Los datos del bufete son consumidos en B.2 (autocomplete al crear caso) y B.22 (portal del abogado).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label htmlFor="firmName">Nombre del bufete <span className="text-rose">*</span></Label>
            <Input id="firmName" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Ej: Smith & Johnson LLP" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email principal</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@firm.com" />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} placeholder="+1-801-555-0000" />
            </div>
          </div>

          <div>
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} placeholder="123 Center St, Suite 200" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" value={city ?? ''} onChange={(e) => setCity(e.target.value)} placeholder="Provo" />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" value={state ?? ''} onChange={(e) => setState(e.target.value)} placeholder="UT" maxLength={2} />
            </div>
          </div>

          <div>
            <Label htmlFor="paymentSpeed">Velocidad de pago</Label>
            <select
              id="paymentSpeed"
              value={paymentSpeed ?? 'UNKNOWN'}
              onChange={(e) => setPaymentSpeed(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {PAYMENT_SPEEDS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="flagsInput">
              Caseflow flags
              <span className="text-text-muted text-xs ml-1 font-normal">(coma · ej: PIP-COVERED, MED-PAY)</span>
            </Label>
            <Input id="flagsInput" value={flagsInput} onChange={(e) => setFlagsInput(e.target.value)} placeholder="PIP-COVERED, MED-PAY" />
          </div>

          <div>
            <Label htmlFor="notes">Notas internas (Edson) — privadas</Label>
            <textarea
              id="notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Notas privadas: paga lento, prefiere email, etc."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
            <span className="text-sm text-text-2">Bufete activo (recibiendo referidos)</span>
          </label>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear bufete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  firm,
  onClose,
  onConfirmed,
}: {
  firm: Firm | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!firm) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/lawyers?id=${firm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!firm} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">Eliminar bufete</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar <strong className="text-text-1">"{firm.firmName}"</strong>? Se hace soft-delete (queda inactivo).
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 text-sm text-text-2">
          {firm.memberCount > 0 && (
            <div className="bg-amber/10 border border-amber/30 rounded-md p-3 mb-3 text-amber text-xs">
              ⚠ Tiene <strong>{firm.memberCount} miembro{firm.memberCount > 1 ? 's' : ''}</strong> (attorneys / case managers). Se marcarán como inactivos también.
            </div>
          )}
        </div>

        {error && (
          <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
            ⚠ {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Eliminando...' : (<><Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
