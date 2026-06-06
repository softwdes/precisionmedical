'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, KeyRound, Trash2, Plus, Search as SearchIcon, Phone, Mail, Printer, Globe, AlertTriangle } from 'lucide-react';
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

// B.32 — Aseguradoras (PIP / Med Pay / Health / Workers / Other)

interface Insurance {
  id: string;
  name: string;
  legalName: string | null;
  shortCode: string;
  color: string;
  type: string;
  claimsPhone: string | null;
  claimsEmail: string | null;
  claimsFax: string | null;
  claimsAddress: string | null;
  portalUrl: string | null;
  hcfaChannel: string;
  preauthRequired: boolean;
  avgResponseDays: number | null;
  responseSpeed: string;
  notes: string | null;
  isActive: boolean;
}

interface Props {
  insurances: Insurance[];
  stats: {
    total: number;
    active: number;
    pip: number;
    medpay: number;
    health: number;
    slow: number;
    fast: number;
    average: number;
  };
}

const COLOR_PALETTE = [
  '#0EA5E9', '#DC2626', '#1D4ED8', '#7C3AED',
  '#059669', '#1E3A8A', '#F59E0B', '#0F766E',
  '#EC4899', '#6366F1', '#10B981', '#8B5CF6',
];

const TYPE_OPTIONS = [
  { value: 'PIP',     label: 'PIP — Personal Injury Protection' },
  { value: 'MED_PAY', label: 'Med Pay — Medical Payments' },
  { value: 'HEALTH',  label: 'Health — Seguro de salud' },
  { value: 'WORKERS', label: 'Workers — Workers Compensation' },
  { value: 'OTHER',   label: 'Otro' },
];

const HCFA_CHANNELS = [
  { value: 'EMAIL',  label: '📧 Email (PDF adjunto)' },
  { value: 'FAX',    label: '📠 Fax' },
  { value: 'PORTAL', label: '🌐 Portal web' },
  { value: 'PAPER',  label: '✉️ Correo postal' },
  { value: 'EDI',    label: '⚡ EDI (preferido high-volume)' },
];

const RESPONSE_SPEEDS = [
  { value: 'UNKNOWN', label: 'Sin data aún' },
  { value: 'FAST',    label: '🟢 Rápido (< 15 días)' },
  { value: 'AVERAGE', label: '🟡 Promedio (15-30 días)' },
  { value: 'SLOW',    label: '🔴 Lento (> 30 días)' },
];

export function InsurancesClient({ insurances, stats }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.insurances');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'PIP' | 'MED_PAY' | 'HEALTH' | 'slow'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<Insurance | null>(null);
  const [viewing, setViewing]   = useState<Insurance | null>(null);
  const [deleting, setDeleting] = useState<Insurance | null>(null);

  const filtered = insurances.filter((i) => {
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !(i.legalName ?? '').toLowerCase().includes(q)) return false;
    }
    if (filter === 'PIP'     && i.type !== 'PIP')     return false;
    if (filter === 'MED_PAY' && i.type !== 'MED_PAY') return false;
    if (filter === 'HEALTH'  && i.type !== 'HEALTH')  return false;
    if (filter === 'slow'    && i.responseSpeed !== 'SLOW') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-1">{t('title')}</h1>
          <p className="text-text-2 text-sm mt-1">
            {t('subtitle', { active: stats.active, pip: stats.pip, medpay: stats.medpay, mockup: 'Mockup B.32' })}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}   value={stats.total}  sub={t('kpiTotalSub')}  color="text-text-1" />
        <KpiCard label={t('kpiActive')}  value={stats.active} sub={t('kpiActiveSub')} color="text-emerald" />
        <KpiCard label={t('kpiSlow')}    value={stats.slow}   sub={t('kpiSlowSub')}   color="text-amber" />
        <KpiCard label={t('kpiFast')}    value={stats.fast}   sub={t('kpiFastSub')}   color="text-brand" />
      </div>

      {/* Filters */}
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
        <FilterPill active={filter === 'all'}     onClick={() => setFilter('all')}     label={tc('all')} count={stats.total} />
        <FilterPill active={filter === 'PIP'}     onClick={() => setFilter('PIP')}     label="PIP"       count={stats.pip} />
        <FilterPill active={filter === 'MED_PAY'} onClick={() => setFilter('MED_PAY')} label="Med Pay"   count={stats.medpay} />
        <FilterPill active={filter === 'HEALTH'}  onClick={() => setFilter('HEALTH')}  label="Health"    count={stats.health} />
        <FilterPill active={filter === 'slow'}    onClick={() => setFilter('slow')}    label={t('kpiSlow')} count={stats.slow} />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/50 text-text-muted text-[10px] uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">{t('columnCarrier')}</th>
                <th className="text-center px-5 py-3 font-semibold">{t('columnType')}</th>
                <th className="text-left px-5 py-3 font-semibold">Claims</th>
                <th className="text-center px-5 py-3 font-semibold">HCFA</th>
                <th className="text-right px-5 py-3 font-semibold">Avg respuesta</th>
                <th className="text-center px-5 py-3 font-semibold">Estado</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted text-sm">
                    {search ? `No hay aseguradoras que coincidan con "${search}"` : 'No hay aseguradoras. Crea la primera arriba.'}
                  </td>
                </tr>
              ) : (
                filtered.map((ins) => (
                  <tr key={ins.id} className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors ${ins.responseSpeed === 'SLOW' ? 'bg-amber/[0.03]' : ''} ${!ins.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <InsuranceAvatar color={ins.color} code={ins.shortCode} />
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate flex items-center gap-1">
                            {ins.name}
                            {ins.responseSpeed === 'SLOW' && (
                              <AlertTriangle className="w-3 h-3 text-amber" />
                            )}
                          </div>
                          {ins.legalName && (
                            <div className="text-text-muted text-[11px] truncate" title={ins.legalName}>{ins.legalName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <TypePill type={ins.type} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-text-2 text-xs space-y-0.5">
                        {ins.claimsPhone && (
                          <div className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3 h-3 text-text-muted shrink-0" />
                            {ins.claimsPhone}
                          </div>
                        )}
                        {ins.claimsEmail && (
                          <div className="flex items-center gap-1.5 text-text-muted">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[180px]" title={ins.claimsEmail}>{ins.claimsEmail}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <HcfaChannelPill channel={ins.hcfaChannel} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ResponseDaysCell days={ins.avgResponseDays} speed={ins.responseSpeed} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusPill active={ins.isActive} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setViewing(ins)} icon={Eye}     label="Ver" />
                        <IconAction onClick={() => setEditing(ins)} icon={Pencil}  label="Editar" />
                        <IconAction onClick={() => {}} icon={KeyRound} label="Permisos" disabled />
                        <IconAction onClick={() => setDeleting(ins)} icon={Trash2} label="Eliminar" variant="danger" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-bg-2/30 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
          <span>{filtered.length} de {stats.total} aseguradoras</span>
          <div className="flex items-center gap-4">
            <span>🟢 &lt;15d: <strong className="text-emerald">{stats.fast}</strong></span>
            <span>🟡 15-30d: <strong className="text-amber">{stats.average}</strong></span>
            <span>🔴 &gt;30d: <strong className="text-rose">{stats.slow}</strong></span>
          </div>
        </div>
      </div>

      <InsuranceDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
      />

      <ViewDialog
        insurance={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); }}
      />

      <DeleteConfirmDialog
        insurance={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => { setDeleting(null); refresh(); }}
      />
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 px-5 py-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-gradient-brand text-white' : 'bg-bg-2 border border-border text-text-2 hover:text-white hover:border-border-strong'
      }`}
    >
      {label} <span className="opacity-70 font-mono">({count})</span>
    </button>
  );
}

function InsuranceAvatar({ color, code }: { color: string; code: string }) {
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md"
      style={{ background: color, boxShadow: `0 4px 12px ${color}40` }}
    >
      {code}
    </div>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    PIP:     'bg-cyan/15 text-cyan border-cyan/30',
    MED_PAY: 'bg-violet/15 text-violet border-violet/30',
    HEALTH:  'bg-emerald/15 text-emerald border-emerald/30',
    WORKERS: 'bg-amber/15 text-amber border-amber/30',
    OTHER:   'bg-white/5 text-text-2 border-border',
  };
  const labels: Record<string, string> = {
    PIP:     'PIP',
    MED_PAY: 'Med Pay',
    HEALTH:  'Health',
    WORKERS: 'Workers',
    OTHER:   'Otro',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold font-mono border ${styles[type] ?? styles.OTHER}`}>
      {labels[type] ?? type}
    </span>
  );
}

function HcfaChannelPill({ channel }: { channel: string }) {
  const icons: Record<string, React.ReactNode> = {
    EMAIL:  <Mail className="w-3 h-3" />,
    FAX:    <Printer className="w-3 h-3" />,
    PORTAL: <Globe className="w-3 h-3" />,
    PAPER:  <Mail className="w-3 h-3" />,
    EDI:    <span>⚡</span>,
  };
  const labels: Record<string, string> = {
    EMAIL: 'Email', FAX: 'Fax', PORTAL: 'Portal', PAPER: 'Postal', EDI: 'EDI',
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-text-2 border border-border">
      {icons[channel] ?? null}
      {labels[channel] ?? channel}
    </span>
  );
}

function ResponseDaysCell({ days, speed }: { days: number | null; speed: string }) {
  if (days === null) return <span className="text-text-muted italic">—</span>;
  const color =
    speed === 'FAST'    ? 'text-emerald' :
    speed === 'AVERAGE' ? 'text-amber'   :
    speed === 'SLOW'    ? 'text-rose'    : 'text-text-2';
  return (
    <span className={`font-mono font-semibold ${color}`}>{days}d</span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald/15 text-emerald border border-emerald/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald" /> Activa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-text-muted border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" /> Inactiva
    </span>
  );
}

function IconAction({
  onClick, icon: Icon, label, variant = 'default', disabled,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
        disabled
          ? 'text-text-muted/40 cursor-not-allowed'
          : variant === 'danger'
            ? 'text-text-muted hover:text-rose hover:bg-rose/10'
            : 'text-text-muted hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function InsuranceDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Insurance | null;
  onSaved: () => void;
}) {
  const [name, setName]             = useState(editing?.name ?? '');
  const [legalName, setLegalName]   = useState(editing?.legalName ?? '');
  const [shortCode, setShortCode]   = useState(editing?.shortCode ?? '');
  const [color, setColor]           = useState(editing?.color ?? COLOR_PALETTE[0]);
  const [type, setType]             = useState(editing?.type ?? 'PIP');
  const [claimsPhone, setClaimsPhone] = useState(editing?.claimsPhone ?? '');
  const [claimsEmail, setClaimsEmail] = useState(editing?.claimsEmail ?? '');
  const [claimsFax, setClaimsFax]   = useState(editing?.claimsFax ?? '');
  const [claimsAddress, setClaimsAddress] = useState(editing?.claimsAddress ?? '');
  const [portalUrl, setPortalUrl]   = useState(editing?.portalUrl ?? '');
  const [hcfaChannel, setHcfaChannel] = useState(editing?.hcfaChannel ?? 'EMAIL');
  const [preauthRequired, setPreauthRequired] = useState(editing?.preauthRequired ?? false);
  const [avgResponseDays, setAvgResponseDays] = useState(editing?.avgResponseDays?.toString() ?? '');
  const [responseSpeed, setResponseSpeed] = useState(editing?.responseSpeed ?? 'UNKNOWN');
  const [notes, setNotes]   = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setName(editing?.name ?? '');
    setLegalName(editing?.legalName ?? '');
    setShortCode(editing?.shortCode ?? '');
    setColor(editing?.color ?? COLOR_PALETTE[0]);
    setType(editing?.type ?? 'PIP');
    setClaimsPhone(editing?.claimsPhone ?? '');
    setClaimsEmail(editing?.claimsEmail ?? '');
    setClaimsFax(editing?.claimsFax ?? '');
    setClaimsAddress(editing?.claimsAddress ?? '');
    setPortalUrl(editing?.portalUrl ?? '');
    setHcfaChannel(editing?.hcfaChannel ?? 'EMAIL');
    setPreauthRequired(editing?.preauthRequired ?? false);
    setAvgResponseDays(editing?.avgResponseDays?.toString() ?? '');
    setResponseSpeed(editing?.responseSpeed ?? 'UNKNOWN');
    setNotes(editing?.notes ?? '');
    setIsActive(editing?.isActive ?? true);
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError('El nombre es obligatorio');
    if (!shortCode.trim()) return setError('El código corto es obligatorio (para avatar)');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/insurances', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          name: name.trim(),
          legalName: legalName.trim() || null,
          shortCode: shortCode.trim().toUpperCase(),
          color,
          type,
          claimsPhone: claimsPhone.trim() || null,
          claimsEmail: claimsEmail.trim() || null,
          claimsFax: claimsFax.trim() || null,
          claimsAddress: claimsAddress.trim() || null,
          portalUrl: portalUrl.trim() || null,
          hcfaChannel,
          preauthRequired,
          avgResponseDays: avgResponseDays ? parseInt(avgResponseDays, 10) : null,
          responseSpeed,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar — ${editing.name}` : 'Nueva aseguradora'}</DialogTitle>
          <DialogDescription>
            Consumido en B.2 (autocomplete al crear caso), B.12 (Edson verifica PIP) y B.26 (Brunella envía HCFA).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Nombre comercial <span className="text-rose">*</span></Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="GEICO" autoFocus />
            </div>
            <div>
              <Label htmlFor="shortCode">Código corto <span className="text-rose">*</span></Label>
              <Input id="shortCode" value={shortCode} onChange={(e) => setShortCode(e.target.value.toUpperCase())} placeholder="G, SF, PR" maxLength={4} />
            </div>
          </div>

          <div>
            <Label htmlFor="legalName">Nombre legal completo</Label>
            <Input id="legalName" value={legalName ?? ''} onChange={(e) => setLegalName(e.target.value)} placeholder="Government Employees Insurance Company" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Color para avatar</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-md transition-all ${color === c ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg-1 scale-110' : 'hover:scale-105'}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="type">Tipo de cobertura</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
              >
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-text-2 text-xs uppercase tracking-wider font-semibold mb-2">Claims contact</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="claimsPhone">Teléfono</Label>
                <Input id="claimsPhone" value={claimsPhone ?? ''} onChange={(e) => setClaimsPhone(e.target.value)} placeholder="1-800-..." />
              </div>
              <div>
                <Label htmlFor="claimsEmail">Email</Label>
                <Input id="claimsEmail" type="email" value={claimsEmail ?? ''} onChange={(e) => setClaimsEmail(e.target.value)} placeholder="claims@..." />
              </div>
              <div>
                <Label htmlFor="claimsFax">Fax</Label>
                <Input id="claimsFax" value={claimsFax ?? ''} onChange={(e) => setClaimsFax(e.target.value)} placeholder="1-866-..." />
              </div>
              <div>
                <Label htmlFor="portalUrl">Portal web</Label>
                <Input id="portalUrl" type="url" value={portalUrl ?? ''} onChange={(e) => setPortalUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="claimsAddress">Dirección postal para claims</Label>
              <textarea
                id="claimsAddress"
                value={claimsAddress ?? ''}
                onChange={(e) => setClaimsAddress(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
                placeholder="PO Box 12345, San Antonio TX 78284"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-text-2 text-xs uppercase tracking-wider font-semibold mb-2">HCFA submission</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="hcfaChannel">Canal preferido</Label>
                <select
                  id="hcfaChannel"
                  value={hcfaChannel}
                  onChange={(e) => setHcfaChannel(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
                >
                  {HCFA_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="avgResponseDays">Días promedio de respuesta</Label>
                <Input id="avgResponseDays" type="number" value={avgResponseDays} onChange={(e) => setAvgResponseDays(e.target.value)} placeholder="14" min={0} />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="responseSpeed">Clasificación de velocidad</Label>
              <select
                id="responseSpeed"
                value={responseSpeed}
                onChange={(e) => setResponseSpeed(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
              >
                {RESPONSE_SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={preauthRequired} onChange={(e) => setPreauthRequired(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">Requiere pre-autorización antes de servicios</span>
            </label>
          </div>

          <div className="pt-3 border-t border-border">
            <Label htmlFor="notes">Notas internas (Brunella/Edson)</Label>
            <textarea
              id="notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Detalles operativos: agente específico, observaciones, etc."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
            <span className="text-sm text-text-2">Aseguradora activa (recibiendo claims)</span>
          </label>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear aseguradora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({
  insurance, onClose, onEdit,
}: {
  insurance: Insurance | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!insurance) return null;
  return (
    <Dialog open={!!insurance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <InsuranceAvatar color={insurance.color} code={insurance.shortCode} />
            <div>
              <div>{insurance.name}</div>
              {insurance.legalName && <div className="text-text-muted text-xs font-normal mt-0.5">{insurance.legalName}</div>}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4 text-sm">
          <InfoRow label="Tipo" value={<TypePill type={insurance.type} />} />
          <InfoRow label="Estado" value={<StatusPill active={insurance.isActive} />} />
          <InfoRow label="Claims phone"
            value={insurance.claimsPhone ? <span className="font-mono">{insurance.claimsPhone}</span> : <Empty />} />
          <InfoRow label="Claims email"
            value={insurance.claimsEmail ? <a href={`mailto:${insurance.claimsEmail}`} className="text-cyan hover:text-white">{insurance.claimsEmail}</a> : <Empty />} />
          <InfoRow label="Claims fax"
            value={insurance.claimsFax ? <span className="font-mono">{insurance.claimsFax}</span> : <Empty />} />
          <InfoRow label="Portal"
            value={insurance.portalUrl ? <a href={insurance.portalUrl} target="_blank" rel="noopener" className="text-cyan hover:text-white truncate inline-block max-w-[280px]">{insurance.portalUrl}</a> : <Empty />} />
          <InfoRow label="HCFA channel" value={<HcfaChannelPill channel={insurance.hcfaChannel} />} />
          <InfoRow label="Avg respuesta" value={<ResponseDaysCell days={insurance.avgResponseDays} speed={insurance.responseSpeed} />} />
          <InfoRow label="Pre-auth req?" value={insurance.preauthRequired ? <span className="text-amber">⚠ Sí</span> : <span className="text-text-2">No</span>} />
          {insurance.notes && (
            <InfoRow label="Notas" value={<div className="text-text-2 whitespace-pre-wrap text-xs">{insurance.notes}</div>} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={onEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> Editar</Button>
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

function Empty() {
  return <span className="text-text-muted italic">—</span>;
}

function DeleteConfirmDialog({
  insurance, onClose, onConfirmed,
}: {
  insurance: Insurance | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!insurance) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/insurances?id=${insurance.id}`, { method: 'DELETE' });
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
    <Dialog open={!!insurance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">Eliminar aseguradora</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar <strong className="text-white">"{insurance.name}"</strong>? Se hace soft-delete (queda inactiva).
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
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
