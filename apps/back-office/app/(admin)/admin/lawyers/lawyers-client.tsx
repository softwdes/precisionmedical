'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Eye, Pencil, Trash2, Plus, Search as SearchIcon,
  Phone, Mail, MapPin,
  Building2, CheckCircle2, User, CalendarPlus, Clock, Users,
} from 'lucide-react';
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

// B.30 — Bufetes / Externos (lista)

interface Firm {
  id: string;
  firmName: string;
  entityType: string;
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
  updatedAt: Date;
}

interface Props {
  firms: Firm[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalMembers: number;
    slowPayers: number;
    independentCount: number;
    newLast30: number;
  };
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ENTITY_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  FIRM:        { label: 'Bufete',       color: 'bg-brand/10 text-brand border-brand/20' },
  INDEPENDENT: { label: 'Independiente', color: 'bg-violet/10 text-violet border-violet/20' },
};

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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={`${stats.active} activas · ${stats.totalMembers} miembros`}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      {/* Stats: 2/3 KPIs + 1/3 Distribución */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* KPIs 2×3 */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label="Total"          value={stats.total}            sub="En catálogo"          color="text-text-1"   icon={Building2}     iconBg="bg-bg-2"         iconColor="text-text-muted" />
          <KpiCard label="Activas"        value={stats.active}           sub="Recibiendo referidos"  color="text-emerald"  icon={CheckCircle2}  iconBg="bg-emerald/10"   iconColor="text-emerald" />
          <KpiCard label="Independientes" value={stats.independentCount} sub="Sin bufete"            color="text-violet"   icon={User}          iconBg="bg-violet/10"    iconColor="text-violet" />
          <KpiCard label="Nuevas 30 días" value={stats.newLast30}        sub="Recientemente"         color="text-cyan"     icon={CalendarPlus}  iconBg="bg-cyan/10"      iconColor="text-cyan" />
          <KpiCard label="Slow payers"    value={stats.slowPayers}       sub=">150 días avg"         color="text-amber"    icon={Clock}         iconBg="bg-amber/10"     iconColor="text-amber" />
          <KpiCard label="Miembros"       value={stats.totalMembers}     sub="Abogados + Mgrs"       color="text-brand"    icon={Users}         iconBg="bg-brand/10"     iconColor="text-brand" />
        </div>

        {/* Panel distribución por tipo */}
        <div className="rounded-lg border border-border bg-bg-1 px-5 py-4 flex flex-col justify-between">
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-3">
            Distribución por tipo
          </div>
          <div className="space-y-3 flex-1">
            {[
              { label: 'Bufetes (Firm)',      count: stats.total - stats.independentCount, color: 'bg-brand',  pct: stats.total > 0 ? Math.round((stats.total - stats.independentCount) / stats.total * 100) : 0 },
              { label: 'Independientes',      count: stats.independentCount,               color: 'bg-violet', pct: stats.total > 0 ? Math.round(stats.independentCount / stats.total * 100) : 0 },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-text-2 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${row.color} inline-block`} />
                    {row.label}
                  </span>
                  <span className="text-[11px] text-text-muted font-mono">{row.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-2 overflow-hidden">
                  <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-row-sep text-[10px] text-text-muted">
            {stats.active} activas · {stats.inactive} inactivas
          </div>
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder={tc('search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <FilterPill active={filter === 'all'}      onClick={() => { setFilter('all');      setPage(1); }} label={t('filterAll')}      count={stats.total} />
        <FilterPill active={filter === 'active'}   onClick={() => { setFilter('active');   setPage(1); }} label={t('filterActive')}   count={stats.active} />
        <FilterPill active={filter === 'inactive'} onClick={() => { setFilter('inactive'); setPage(1); }} label={t('filterInactive')} count={stats.inactive} />
        <FilterPill active={filter === 'slow'}     onClick={() => { setFilter('slow');     setPage(1); }} label={t('filterSlow')}     count={stats.slowPayers} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>Nombre</DataTable.Th>
              <DataTable.Th>Tipo</DataTable.Th>
              <DataTable.Th>Contacto</DataTable.Th>
              <DataTable.Th>Dirección</DataTable.Th>
              <DataTable.Th align="center">Miembros</DataTable.Th>
              <DataTable.Th align="center">Pago</DataTable.Th>
              <DataTable.Th>Flags</DataTable.Th>
              <DataTable.Th align="center">{tc('status')}</DataTable.Th>
              <DataTable.Th>Creado</DataTable.Th>
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
                paginated.map((f) => {
                  const typeInfo = ENTITY_TYPE_LABEL[f.entityType] ?? { label: f.entityType, color: 'bg-bg-2 text-text-2 border-border' };
                  return (
                    <DataTable.Row key={f.id} muted={f.status !== 'ACTIVE'}>
                      {/* Nombre + email icon */}
                      <DataTable.Td className="py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <EntityAvatar name={f.firmName} size={6} />
                          <span className="text-text-1 font-semibold truncate text-[13px]">{f.firmName}</span>
                          {f.email && (
                            <a href={`mailto:${f.email}`} title={f.email} onClick={(e) => e.stopPropagation()}
                              className="shrink-0 text-text-muted hover:text-cyan transition-colors">
                              <Mail className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </DataTable.Td>

                      {/* Tipo */}
                      <DataTable.Td className="py-1.5">
                        <TagPill label={typeInfo.label} colorClass={typeInfo.color} compact />
                      </DataTable.Td>

                      {/* Contacto — solo teléfono, una línea */}
                      <DataTable.Td className="py-1.5">
                        {f.phone ? (
                          <div className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
                            <Phone className="w-3 h-3 shrink-0" />
                            {f.phone}
                          </div>
                        ) : (
                          <span className="text-text-muted text-[10px] italic">—</span>
                        )}
                      </DataTable.Td>

                      {/* Dirección — solo ciudad, ST */}
                      <DataTable.Td className="py-1.5">
                        {(f.city || f.state) ? (
                          <div className="flex items-center gap-1 text-[11px] text-text-2">
                            <MapPin className="w-3 h-3 text-text-muted shrink-0" />
                            <span className="truncate">{[f.city, f.state].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[10px] italic">—</span>
                        )}
                      </DataTable.Td>

                      {/* Miembros */}
                      <DataTable.Td align="center" className="py-1.5 text-text-1 font-mono font-semibold text-sm">
                        {f.memberCount > 0 ? f.memberCount : <span className="text-text-muted">0</span>}
                      </DataTable.Td>

                      {/* Pago */}
                      <DataTable.Td align="center" className="py-1.5">
                        <PaymentSpeedPill speed={f.paymentSpeed} />
                      </DataTable.Td>

                      {/* Flags */}
                      <DataTable.Td className="py-1.5">
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

                      {/* Status */}
                      <DataTable.Td align="center" className="py-1.5">
                        <StatusPill
                          state={f.status === 'ACTIVE' ? 'active' : 'inactive'}
                          label={f.status === 'ACTIVE' ? 'Activo' : (f.status === 'INACTIVE' ? 'Inactivo' : f.status)}
                        />
                      </DataTable.Td>

                      {/* Creado */}
                      <DataTable.Td className="py-1.5">
                        <div className="text-[11px] text-text-muted font-mono whitespace-nowrap">{fmtDate(f.createdAt)}</div>
                      </DataTable.Td>

                      {/* Acciones */}
                      <DataTable.Td align="right" className="py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/lawyers/${f.id}?tab=cases`} title="Ver casos">
                            <IconAction icon={Eye} label="Ver detalle" />
                          </Link>
                          <IconAction onClick={() => setEditing(f)}  icon={Pencil}  label="Editar" />
                          <IconAction onClick={() => setDeleting(f)} icon={Trash2}  label="Eliminar" variant="danger" />
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
          left={`${filtered.length} bufete${filtered.length !== 1 ? 's' : ''} · página ${safePage} de ${totalPages}`}
          right={
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="px-2 py-1 text-xs rounded border border-border text-text-2 hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >«</button>
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage <= 1}
                className="px-2 py-1 text-xs rounded border border-border text-text-2 hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >‹</button>
              <span className="px-2 text-xs text-text-muted font-mono">{safePage}/{totalPages}</span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="px-2 py-1 text-xs rounded border border-border text-text-2 hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                className="px-2 py-1 text-xs rounded border border-border text-text-2 hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >»</button>
            </div>
          }
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
