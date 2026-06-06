'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

// B.33 — Servicios CPT/HCPCS/Custom

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

const TYPE_OPTIONS = [
  { value: 'CPT',       label: 'CPT (AMA · facturable)' },
  { value: 'HCPCS',     label: 'HCPCS Level II (CMS · drugs/DME)' },
  { value: 'CUSTOM_PM', label: 'Custom PM- (interno · NO facturable)' },
];

const CATEGORY_OPTIONS = [
  { value: 'EM',                label: 'E&M (Evaluation & Mgmt)' },
  { value: 'CHIROPRACTIC',      label: 'Chiropractic' },
  { value: 'PHYSICAL_THERAPY',  label: 'Physical Therapy' },
  { value: 'IMAGING',           label: 'Imaging' },
  { value: 'INJECTIONS',        label: 'Injections' },
  { value: 'SURGERY',           label: 'Surgery' },
  { value: 'DME',               label: 'DME (Durable Medical Equipment)' },
  { value: 'DRUGS',             label: 'Drugs (J-codes)' },
  { value: 'LAB',               label: 'Laboratory' },
  { value: 'REPORTS',           label: 'Reports / Legal narratives' },
  { value: 'CUSTOM',            label: 'Custom Internal' },
  { value: 'OTHER',             label: 'Other' },
];

export function ServicesClient({ services, stats }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<'billable' | 'internal'>('billable');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'CPT' | 'HCPCS' | 'CUSTOM_PM'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [viewing, setViewing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  const filtered = services.filter((s) => {
    // Tab filter
    if (tab === 'billable' && s.isInternalOnly) return false;
    if (tab === 'internal' && !s.isInternalOnly) return false;
    // Search
    if (search) {
      const q = search.toLowerCase();
      if (!s.code.toLowerCase().includes(q) && !s.shortDescription.toLowerCase().includes(q)) return false;
    }
    // Type/Favorites filter
    if (filter === 'favorites' && !s.isFavorite) return false;
    if (filter === 'CPT' && s.type !== 'CPT') return false;
    if (filter === 'HCPCS' && s.type !== 'HCPCS') return false;
    if (filter === 'CUSTOM_PM' && s.type !== 'CUSTOM_PM') return false;
    // Category filter
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-1">Servicios facturables</h1>
          <p className="text-text-2 text-sm mt-1">
            {stats.billable} CPT/HCPCS · {stats.internal} internos · {stats.favorites} ⭐ favoritos ·{' '}
            <span className="text-text-muted text-xs font-mono">Mockup B.33 · Fee schedule 2026</span>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo servicio
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        <TabButton active={tab === 'billable'} onClick={() => setTab('billable')}>
          Facturables <span className="text-text-muted ml-1 font-mono">({stats.billable})</span>
        </TabButton>
        <TabButton active={tab === 'internal'} onClick={() => setTab('internal')}>
          Internos / PM- <span className="text-text-muted ml-1 font-mono">({stats.internal})</span>
        </TabButton>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total" value={stats.total} sub={`${stats.cpt} CPT · ${stats.hcpcs} HCPCS · ${stats.custom} PM`} color="text-text-1" />
        <KpiCard label="Activos" value={stats.active} sub="En catálogo 2026" color="text-emerald" />
        <KpiCard label="Mis favoritos" value={stats.favorites} sub="Para autocomplete B.21" color="text-amber" />
        <KpiCard label="Año fiscal" value={2026} sub="Update anual Enero AMA" color="text-brand" />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Buscar código o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FilterPill active={filter === 'all'}        onClick={() => setFilter('all')}        label="Todos"      count={tab === 'billable' ? stats.billable : stats.internal} />
          <FilterPill active={filter === 'favorites'}  onClick={() => setFilter('favorites')}  label="⭐ Favoritos" count={stats.favorites} />
          {tab === 'billable' && (
            <>
              <FilterPill active={filter === 'CPT'}    onClick={() => setFilter('CPT')}    label="CPT"   count={stats.cpt} />
              <FilterPill active={filter === 'HCPCS'}  onClick={() => setFilter('HCPCS')}  label="HCPCS" count={stats.hcpcs} />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-text-muted">Categoría:</Label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-2 border border-border rounded-md px-3 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand"
          >
            <option value="all">Todas las categorías</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/50 text-text-muted text-[10px] uppercase tracking-wider">
                <th className="w-10 text-center px-2 py-3 font-semibold">⭐</th>
                <th className="text-left px-5 py-3 font-semibold">Código</th>
                <th className="text-center px-5 py-3 font-semibold">Tipo</th>
                <th className="text-left px-5 py-3 font-semibold">Descripción</th>
                <th className="text-center px-5 py-3 font-semibold">Categoría</th>
                <th className="text-right px-5 py-3 font-semibold">Fee 2026</th>
                <th className="text-center px-5 py-3 font-semibold">Modifiers</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-text-muted text-sm">
                    {search ? `No hay servicios que coincidan con "${search}"` : 'No hay servicios. Crea el primero arriba.'}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors ${!s.isActive ? 'opacity-50' : ''} ${s.isFavorite ? 'bg-brand/[0.04]' : ''}`}>
                    <td className="text-center px-2 py-3.5">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(s)}
                        className="hover:scale-125 transition-transform"
                        title={s.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                      >
                        <Star className={`w-4 h-4 ${s.isFavorite ? 'fill-amber text-amber' : 'text-text-muted/40'}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <code className="text-text-1 font-mono font-bold text-sm">{s.code}</code>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <TypePill type={s.type} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-text-1 font-semibold text-[13px]">{s.shortDescription}</div>
                      {s.longDescription && (
                        <div className="text-text-muted text-[11px] mt-0.5 line-clamp-1" title={s.longDescription}>{s.longDescription}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <CategoryPill cat={s.category} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-emerald font-mono font-bold">${s.currentFee.toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-text-muted font-mono text-[10px]">
                      {s.modifiersAllowed.length === 0 ? '—' : s.modifiersAllowed.join(' · ')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setViewing(s)}  icon={Eye}    label="Ver" />
                        <IconAction onClick={() => setEditing(s)}  icon={Pencil} label="Editar" />
                        <IconAction onClick={() => setDeleting(s)} icon={Trash2} label="Eliminar" variant="danger" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-bg-2/30 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
          <span>{filtered.length} servicios mostrados</span>
          <span className="font-mono">phoenix-dev · fiscal year 2026</span>
        </div>
      </div>

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

// ─── Atoms ──────────────────────────────────────────────────────────────────

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
        active ? 'bg-gradient-brand text-white' : 'bg-bg-2 border border-border text-text-2 hover:text-text-1 hover:border-border-strong'
      }`}
    >
      {label} <span className="opacity-70 font-mono">({count})</span>
    </button>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    CPT:       'bg-brand/15 text-brand border-brand/30',
    HCPCS:     'bg-emerald/15 text-emerald border-emerald/30',
    CUSTOM_PM: 'bg-pink/15 text-pink border-pink/30',
  };
  const labels: Record<string, string> = {
    CPT: 'CPT', HCPCS: 'HCPCS', CUSTOM_PM: 'PM-',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold font-mono border ${styles[type] ?? ''}`}>
      {labels[type] ?? type}
    </span>
  );
}

function CategoryPill({ cat }: { cat: string }) {
  const labels: Record<string, string> = {
    EM: 'E&M',
    CHIROPRACTIC: 'Chiro',
    PHYSICAL_THERAPY: 'PT',
    IMAGING: 'Imaging',
    INJECTIONS: 'Inject',
    SURGERY: 'Surgery',
    DME: 'DME',
    DRUGS: 'Drugs',
    LAB: 'Lab',
    REPORTS: 'Reports',
    CUSTOM: 'Custom',
    OTHER: 'Other',
  };
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-2 text-text-2 border border-border">
      {labels[cat] ?? cat}
    </span>
  );
}

function IconAction({
  onClick, icon: Icon, label, variant = 'default',
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
        variant === 'danger'
          ? 'text-text-muted hover:text-rose hover:bg-rose/10'
          : 'text-text-muted hover:text-text-1 hover:bg-white/5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
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

  // Auto-set internal-only when type changes to CUSTOM_PM
  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (newType === 'CUSTOM_PM') setIsInternalOnly(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!code.trim()) return setError('El código es obligatorio');
    if (!shortDesc.trim()) return setError('La descripción corta es obligatoria');
    if (type === 'CUSTOM_PM' && !code.startsWith('PM-')) {
      return setError('Códigos CUSTOM_PM deben empezar con "PM-" (ej. PM-DIRECT)');
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
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar — ${editing.code}` : 'Nuevo servicio'}</DialogTitle>
          <DialogDescription>
            Consumido en B.21 (CPT + firma del doctor), B.26 (HCFA submission Brunella), y como snapshot en B.18 Closing Case.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="code">Código <span className="text-rose">*</span></Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="99213, J3301, PM-NARRATIVE" autoFocus />
            </div>
            <div>
              <Label htmlFor="type">Tipo</Label>
              <select id="type" value={type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="currentFee">Fee <span className="text-rose">*</span></Label>
              <Input id="currentFee" type="number" step="0.01" min="0" value={currentFee} onChange={(e) => setCurrentFee(e.target.value)} placeholder="300.00" />
            </div>
          </div>

          <div>
            <Label htmlFor="shortDesc">Descripción corta <span className="text-rose">*</span></Label>
            <Input id="shortDesc" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="Office visit · 15 min" />
          </div>

          <div>
            <Label htmlFor="longDesc">Descripción AMA completa</Label>
            <textarea
              id="longDesc"
              value={longDesc ?? ''}
              onChange={(e) => setLongDesc(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="Office or other outpatient visit for the evaluation and management..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">Categoría</Label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="modifiersInput">Modifiers permitidos <span className="text-text-muted text-xs font-normal">(coma)</span></Label>
              <Input id="modifiersInput" value={modifiersInput} onChange={(e) => setModifiersInput(e.target.value)} placeholder="-25, -59, -76" />
            </div>
          </div>

          <div>
            <Label htmlFor="bundlingNotes">Notas de bundling</Label>
            <textarea
              id="bundlingNotes"
              value={bundlingNotes ?? ''}
              onChange={(e) => setBundlingNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="No se puede facturar junto con 97140. Requiere modifier -25 si se factura con E&M."
            />
          </div>

          <div>
            <Label htmlFor="notes">Notas internas</Label>
            <textarea
              id="notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
              placeholder="Notas operativas privadas..."
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">Servicio activo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isInternalOnly} onChange={(e) => setIsInternalOnly(e.target.checked)} disabled={type === 'CUSTOM_PM'} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">
                Solo interno (NO facturable a aseguradora)
                {type === 'CUSTOM_PM' && <span className="text-text-muted ml-1">— automático para CUSTOM_PM</span>}
              </span>
            </label>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear servicio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ service, onClose, onEdit }: { service: Service | null; onClose: () => void; onEdit: () => void }) {
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
          <InfoRow label="Fee 2026"     value={<span className="text-emerald font-mono font-bold">${service.currentFee.toFixed(2)}</span>} />
          <InfoRow label="Categoría"    value={<CategoryPill cat={service.category} />} />
          <InfoRow label="Año fiscal"   value={<span className="font-mono">{service.fiscalYear}</span>} />
          <InfoRow label="Modifiers"
            value={service.modifiersAllowed.length === 0 ? <Empty /> : (
              <div className="flex flex-wrap gap-1">
                {service.modifiersAllowed.map((m) => (
                  <code key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-2 border border-border text-text-2">{m}</code>
                ))}
              </div>
            )} />
          {service.bundlingNotes && (
            <InfoRow label="Bundling" value={<div className="text-text-2 text-xs whitespace-pre-wrap">{service.bundlingNotes}</div>} />
          )}
          <InfoRow label="Estado"       value={service.isActive ? <span className="text-emerald">Activo</span> : <span className="text-text-muted">Inactivo</span>} />
          <InfoRow label="Facturable"   value={service.isInternalOnly ? <span className="text-amber">⚠ Solo interno (NO a seguro)</span> : <span className="text-emerald">Sí (a aseguradora)</span>} />
          {service.notes && (
            <InfoRow label="Notas" value={<div className="text-text-2 text-xs whitespace-pre-wrap">{service.notes}</div>} />
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

function Empty() { return <span className="text-text-muted italic">—</span>; }

function DeleteConfirmDialog({
  service, onClose, onConfirmed,
}: {
  service: Service | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
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
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">Eliminar servicio</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar <code className="text-text-1 font-mono">{service.code}</code> — {service.shortDescription}? Se hace soft-delete.
          </DialogDescription>
        </DialogHeader>
        {error && <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>}
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
