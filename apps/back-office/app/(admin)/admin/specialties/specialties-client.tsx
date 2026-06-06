'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Label,
  Badge,
} from '@precision/ui';

// B.36 — Specialties CRUD client component

interface Specialty {
  id: string;
  name: string;
  description: string | null;
  color: string;
  caseType: string;
  cptSuggested: string[];
  workflowType: string;
  isActive: boolean;
  sortOrder: number;
  doctorCount: number;
}

interface Props {
  specialties: Specialty[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalDoctors: number;
  };
}

const COLOR_PALETTE = [
  '#F43F5E', // rose
  '#F59E0B', // amber
  '#34D399', // emerald
  '#06B6D4', // cyan
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
];

const WORKFLOW_TYPES = [
  { value: 'MVA', label: 'MVA (Motor Vehicle Accident · lien-based)' },
  { value: 'GM', label: 'GM (General Medicine · billing tradicional)' },
  { value: 'SELFPAY', label: 'Self-Pay / Membership' },
  { value: 'NURSING_HOME', label: 'Nursing Home (visitas domiciliarias)' },
];

const CASE_TYPES = ['MVA', 'GENERAL', 'NURSING_HOME'] as const;

export function SpecialtiesClient({ specialties, stats }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Specialty | null>(null);

  // Filtered list
  const filtered = specialties.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active' && !s.isActive) return false;
    if (filter === 'inactive' && s.isActive) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🩺 Especialidades / Service lines
          </h1>
          <p className="text-text-2 text-sm mt-1">
            {stats.active} activas · {stats.totalDoctors} doctores asignados ·{' '}
            <span className="text-text-muted text-xs">Mockup B.36</span>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Nueva especialidad</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-text-muted uppercase tracking-wider font-semibold">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-text-muted mt-1">Especialidades en catálogo</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-text-muted uppercase tracking-wider font-semibold">
              Activas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald">{stats.active}</div>
            <div className="text-xs text-text-muted mt-1">En uso</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-text-muted uppercase tracking-wider font-semibold">
              Inactivas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose">{stats.inactive}</div>
            <div className="text-xs text-text-muted mt-1">Soft-deleted / paused</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-text-muted uppercase tracking-wider font-semibold">
              Doctores asignados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand">{stats.totalDoctors}</div>
            <div className="text-xs text-text-muted mt-1">Algunos en múltiples</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Input
          placeholder="🔍 Buscar especialidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Todas ({stats.total})
        </Button>
        <Button
          variant={filter === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('active')}
        >
          Activas ({stats.active})
        </Button>
        <Button
          variant={filter === 'inactive' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('inactive')}
        >
          Inactivas ({stats.inactive})
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold">Descripción</th>
                <th className="text-center px-4 py-3 font-semibold">Color</th>
                <th className="text-center px-4 py-3 font-semibold">Workflow</th>
                <th className="text-center px-4 py-3 font-semibold">CPT sugeridos</th>
                <th className="text-center px-4 py-3 font-semibold">Doctores</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-text-muted">
                    {search
                      ? `No hay especialidades que coincidan con "${search}"`
                      : 'No hay especialidades. Crea la primera arriba.'}
                  </td>
                </tr>
              ) : (
                filtered.map((sp) => (
                  <tr
                    key={sp.id}
                    className="border-b border-border/40 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ background: sp.color }}
                        />
                        <span className="text-white font-semibold">{sp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-2 text-xs max-w-md">
                      {sp.description || <span className="text-text-muted italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="w-6 h-6 rounded inline-block border border-white/20"
                        style={{ background: sp.color }}
                        title={sp.color}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={sp.workflowType === 'MVA' ? 'default' : 'secondary'}>
                        {sp.workflowType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-text-2 font-mono text-xs">
                      {sp.cptSuggested.length > 0 ? (
                        <span title={sp.cptSuggested.join(', ')}>
                          {sp.cptSuggested.slice(0, 2).join(', ')}
                          {sp.cptSuggested.length > 2 && ` +${sp.cptSuggested.length - 2}`}
                        </span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-white font-mono font-semibold">
                      {sp.doctorCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sp.isActive ? (
                        <Badge variant="default" className="bg-emerald/20 text-emerald">
                          ✓ Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">⏸ Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(sp)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-text-muted text-right">
        {filtered.length} de {stats.total} especialidades · phoenix-dev local
      </div>

      {/* Modal: Nueva especialidad */}
      <SpecialtyDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        editing={editing}
        onSaved={() => {
          setCreateOpen(false);
          setEditing(null);
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}

// ─── Dialog Component ───────────────────────────────────────────────────────

function SpecialtyDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Specialty | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [color, setColor] = useState(editing?.color ?? COLOR_PALETTE[0]);
  const [workflowType, setWorkflowType] = useState(editing?.workflowType ?? 'MVA');
  const [caseType, setCaseType] = useState<string>(editing?.caseType ?? 'MVA');
  const [cptInput, setCptInput] = useState(editing?.cptSuggested.join(', ') ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when editing changes
  // (basic reset without useEffect for simplicity)
  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setColor(editing?.color ?? COLOR_PALETTE[0]);
    setWorkflowType(editing?.workflowType ?? 'MVA');
    setCaseType(editing?.caseType ?? 'MVA');
    setCptInput(editing?.cptSuggested.join(', ') ?? '');
    setIsActive(editing?.isActive ?? true);
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const cptArray = cptInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const res = await fetch('/api/admin/specialties', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          name: name.trim(),
          description: description.trim() || null,
          color,
          workflowType,
          caseType,
          cptSuggested: cptArray,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Editar — ${editing.name}` : 'Nueva especialidad'}
          </DialogTitle>
          <DialogDescription>
            Define el service line. Se consume en B.10 calendar, B.17 Doctor "Mi día", B.21 firma de
            nota.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">
              Nombre <span className="text-rose">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Cardiology"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Descripción opcional del service line..."
            />
          </div>

          <div>
            <Label>Color · para identificar en calendario y dashboard</Label>
            <div className="flex gap-2 mt-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-md transition-all ${
                    color === c ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg-1 scale-110' : ''
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="workflowType">Workflow</Label>
              <select
                id="workflowType"
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
              >
                {WORKFLOW_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="caseType">Case type</Label>
              <select
                id="caseType"
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
              >
                {CASE_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="cptInput">
              CPT codes sugeridos
              <span className="text-text-muted text-xs ml-1">
                (separados por coma · pre-cargan en B.21 al firmar nota)
              </span>
            </Label>
            <Input
              id="cptInput"
              value={cptInput}
              onChange={(e) => setCptInput(e.target.value)}
              placeholder="99213, 99214, 98941"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              Especialidad activa
            </Label>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear especialidad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
