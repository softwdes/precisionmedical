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

// B.35 — Diagnósticos ICD-10 + SNOMED CT dual

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
  diagnoses: Diagnosis[];
  stats: {
    total: number;
    active: number;
    piRelevant: number;
    withSnomed: number;
    favorites: number;
  };
}

const CATEGORY_OPTIONS = [
  { value: 'S',     label: 'S — Lesiones (Injuries)' },
  { value: 'T',     label: 'T — Lesiones (cont.)' },
  { value: 'M',     label: 'M — Musculoesqueléticas' },
  { value: 'R',     label: 'R — Síntomas' },
  { value: 'G',     label: 'G — Neurológicas' },
  { value: 'F',     label: 'F — Mental / Behavioral' },
  { value: 'V_W',   label: 'V/W — Causa externa (accidente)' },
  { value: 'Z',     label: 'Z — Factores influencing health' },
  { value: 'OTHER', label: 'Otro' },
];

export function DiagnosesClient({ diagnoses, stats }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'piRelevant'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Diagnosis | null>(null);
  const [viewing, setViewing] = useState<Diagnosis | null>(null);
  const [deleting, setDeleting] = useState<Diagnosis | null>(null);

  const filtered = diagnoses.filter((d) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !d.icd10Code.toLowerCase().includes(q) &&
        !d.icd10Description.toLowerCase().includes(q) &&
        !(d.snomedCode ?? '').toLowerCase().includes(q) &&
        !(d.snomedDescription ?? '').toLowerCase().includes(q)
      ) return false;
    }
    if (filter === 'favorites' && !d.isFavorite) return false;
    if (filter === 'piRelevant' && !d.piRelevant) return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  const toggleFavorite = async (dx: Diagnosis) => {
    await fetch(`/api/admin/diagnoses/${dx.id}/favorite`, {
      method: dx.isFavorite ? 'DELETE' : 'POST',
    });
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-1">Diagnósticos</h1>
          <p className="text-text-2 text-sm mt-1">
            ICD-10 + SNOMED CT dual coding · {stats.piRelevant} PI-relevant · {stats.favorites} ⭐ favoritos ·{' '}
            <span className="text-text-muted text-xs font-mono">Mockup B.35</span>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo diagnóstico
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total"        value={stats.total}      sub="Diagnósticos en catálogo" color="text-text-1" />
        <KpiCard label="PI-Relevant"  value={stats.piRelevant} sub="Para casos MVA"           color="text-rose" />
        <KpiCard label="Con SNOMED"   value={stats.withSnomed} sub="Dual coding completo"     color="text-emerald" />
        <KpiCard label="Mis favoritos" value={stats.favorites}  sub="Para B.18 autocomplete"   color="text-amber" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Buscar por código ICD-10, SNOMED, o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FilterPill active={filter === 'all'}        onClick={() => setFilter('all')}        label="Todos"        count={stats.total} />
          <FilterPill active={filter === 'favorites'}  onClick={() => setFilter('favorites')}  label="⭐ Favoritos"  count={stats.favorites} />
          <FilterPill active={filter === 'piRelevant'} onClick={() => setFilter('piRelevant')} label="🩸 PI-Relevant" count={stats.piRelevant} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-text-muted">Categoría ICD-10:</Label>
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

      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/50 text-text-muted text-[10px] uppercase tracking-wider">
                <th className="w-10 text-center px-2 py-3 font-semibold">⭐</th>
                <th className="text-left px-5 py-3 font-semibold">ICD-10 (billing)</th>
                <th className="text-left px-5 py-3 font-semibold">SNOMED CT (clínico)</th>
                <th className="text-center px-5 py-3 font-semibold">Cat.</th>
                <th className="text-left px-5 py-3 font-semibold">Body system</th>
                <th className="text-center px-5 py-3 font-semibold">PI</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted text-sm">
                    {search ? `No hay diagnósticos que coincidan con "${search}"` : 'No hay diagnósticos. Crea el primero arriba.'}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors ${!d.isActive ? 'opacity-50' : ''} ${d.isFavorite ? 'bg-brand/[0.04]' : ''}`}>
                    <td className="text-center px-2 py-3.5">
                      <button type="button" onClick={() => toggleFavorite(d)} className="hover:scale-125 transition-transform" title={d.isFavorite ? 'Quitar' : 'Marcar favorito'}>
                        <Star className={`w-4 h-4 ${d.isFavorite ? 'fill-amber text-amber' : 'text-text-muted/40'}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <code className="text-brand font-mono font-bold text-sm">{d.icd10Code}</code>
                      <div className="text-text-1 text-[12.5px] mt-0.5 line-clamp-1" title={d.icd10Description}>{d.icd10Description}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {d.snomedCode ? (
                        <>
                          <code className="text-emerald font-mono font-bold text-sm">{d.snomedCode}</code>
                          <div className="text-text-2 text-[12.5px] mt-0.5 line-clamp-1" title={d.snomedDescription ?? ''}>{d.snomedDescription}</div>
                        </>
                      ) : (
                        <span className="text-text-muted italic text-xs">Sin SNOMED mapping</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <CategoryPill cat={d.category} />
                    </td>
                    <td className="px-5 py-3.5 text-text-2 text-xs">
                      {d.bodySystem ?? <span className="text-text-muted italic">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {d.piRelevant ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose/15 text-rose border border-rose/30">
                          🩸 PI
                        </span>
                      ) : (
                        <span className="text-text-muted text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setViewing(d)}  icon={Eye}    label="Ver" />
                        <IconAction onClick={() => setEditing(d)}  icon={Pencil} label="Editar" />
                        <IconAction onClick={() => setDeleting(d)} icon={Trash2} label="Eliminar" variant="danger" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-bg-2/30 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
          <span>{filtered.length} diagnósticos mostrados</span>
          <span className="text-text-muted">ICD-10 source: CDC · SNOMED CT source: NLM/UMLS · Both free for US clinical use</span>
        </div>
      </div>

      <DiagnosisDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditing(null); } }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); refresh(); }}
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
        active ? 'bg-gradient-brand text-white' : 'bg-bg-2 border border-border text-text-2 hover:text-text-1 hover:border-border-strong'
      }`}
    >
      {label} <span className="opacity-70 font-mono">({count})</span>
    </button>
  );
}

function CategoryPill({ cat }: { cat: string }) {
  const styles: Record<string, string> = {
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
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${styles[cat] ?? styles.OTHER}`}>
      {cat}
    </span>
  );
}

function IconAction({ onClick, icon: Icon, label, variant = 'default' }: { onClick: () => void; icon: React.ElementType; label: string; variant?: 'default' | 'danger' }) {
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

function DiagnosisDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editing: Diagnosis | null; onSaved: () => void }) {
  const [icd10Code, setIcd10Code]     = useState(editing?.icd10Code ?? '');
  const [icd10Description, setIcd10Description] = useState(editing?.icd10Description ?? '');
  const [snomedCode, setSnomedCode]   = useState(editing?.snomedCode ?? '');
  const [snomedDescription, setSnomedDescription] = useState(editing?.snomedDescription ?? '');
  const [category, setCategory]       = useState(editing?.category ?? 'M');
  const [bodySystem, setBodySystem]   = useState(editing?.bodySystem ?? '');
  const [piRelevant, setPiRelevant]   = useState(editing?.piRelevant ?? false);
  const [isActive, setIsActive]       = useState(editing?.isActive ?? true);
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
    if (!icd10Code.trim()) return setError('El código ICD-10 es obligatorio');
    if (!icd10Description.trim()) return setError('La descripción ICD-10 es obligatoria');
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
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar — ${editing.icd10Code}` : 'Nuevo diagnóstico'}</DialogTitle>
          <DialogDescription>
            Dual coding: ICD-10 (mandatorio para HCFA/B.26) + SNOMED CT (clínico granular para B.18).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="bg-brand/5 border border-brand/20 rounded-md p-3">
            <div className="text-brand text-xs font-semibold uppercase tracking-wider mb-2">ICD-10 (billing · mandatorio)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="icd10Code">Código ICD-10 <span className="text-rose">*</span></Label>
                <Input id="icd10Code" value={icd10Code} onChange={(e) => setIcd10Code(e.target.value.toUpperCase())} placeholder="M54.2" autoFocus />
              </div>
              <div>
                <Label htmlFor="category">Capítulo</Label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                  {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="icd10Description">Descripción ICD-10 <span className="text-rose">*</span></Label>
              <Input id="icd10Description" value={icd10Description} onChange={(e) => setIcd10Description(e.target.value)} placeholder="Cervicalgia" />
            </div>
          </div>

          <div className="bg-emerald/5 border border-emerald/20 rounded-md p-3">
            <div className="text-emerald text-xs font-semibold uppercase tracking-wider mb-2">SNOMED CT (clínico · opcional)</div>
            <div>
              <Label htmlFor="snomedCode">Código SNOMED</Label>
              <Input id="snomedCode" value={snomedCode ?? ''} onChange={(e) => setSnomedCode(e.target.value)} placeholder="102554000" />
            </div>
            <div className="mt-3">
              <Label htmlFor="snomedDescription">Descripción SNOMED</Label>
              <Input id="snomedDescription" value={snomedDescription ?? ''} onChange={(e) => setSnomedDescription(e.target.value)} placeholder="Tenderness of spinous process" />
            </div>
          </div>

          <div>
            <Label htmlFor="bodySystem">Body system</Label>
            <Input id="bodySystem" value={bodySystem ?? ''} onChange={(e) => setBodySystem(e.target.value)} placeholder="Cervical spine, Lumbar spine, Head, etc." />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={piRelevant} onChange={(e) => setPiRelevant(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">🩸 Relevante para Personal Injury (MVA cases)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
              <span className="text-sm text-text-2">Diagnóstico activo</span>
            </label>
          </div>

          {error && <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear diagnóstico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ diagnosis, onClose, onEdit }: { diagnosis: Diagnosis | null; onClose: () => void; onEdit: () => void }) {
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
            <div className="flex items-baseline gap-2">
              <code className="text-brand font-mono font-bold text-base">{diagnosis.icd10Code}</code>
            </div>
            <div className="text-text-2 text-sm mt-1">{diagnosis.icd10Description}</div>
          </div>

          {diagnosis.snomedCode && (
            <div className="bg-emerald/5 border border-emerald/20 rounded-md p-3">
              <div className="text-emerald text-xs font-semibold uppercase tracking-wider mb-1.5">SNOMED CT (clínico)</div>
              <div className="flex items-baseline gap-2">
                <code className="text-emerald font-mono font-bold text-base">{diagnosis.snomedCode}</code>
              </div>
              <div className="text-text-2 text-sm mt-1">{diagnosis.snomedDescription}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Capítulo"    value={<CategoryPill cat={diagnosis.category} />} />
            <InfoRow label="Body system" value={diagnosis.bodySystem ?? <span className="text-text-muted italic">—</span>} />
            <InfoRow label="PI-Relevant" value={diagnosis.piRelevant ? <span className="text-rose">🩸 Sí</span> : <span className="text-text-2">No</span>} />
            <InfoRow label="Estado"      value={diagnosis.isActive ? <span className="text-emerald">Activo</span> : <span className="text-text-muted">Inactivo</span>} />
          </div>
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
    <div className="py-1.5 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-text-1 mt-0.5">{value}</div>
    </div>
  );
}

function DeleteConfirmDialog({ diagnosis, onClose, onConfirmed }: { diagnosis: Diagnosis | null; onClose: () => void; onConfirmed: () => void }) {
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
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!diagnosis} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">Eliminar diagnóstico</DialogTitle>
          <DialogDescription>
            ¿Seguro eliminar <code className="text-text-1 font-mono">{diagnosis.icd10Code}</code> — {diagnosis.icd10Description}? Se desactiva (isActive=false).
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
