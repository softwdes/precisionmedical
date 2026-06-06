'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, KeyRound, Trash2, Plus, Search as SearchIcon } from 'lucide-react';
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
} from '@/components/ui-phoenix';

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
  '#F43F5E', '#F59E0B', '#34D399', '#06B6D4',
  '#6366F1', '#8B5CF6', '#EC4899',
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
  const t = useTranslations('phoenix.specialties');
  const tc = useTranslations('phoenix.common');
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Specialty | null>(null);
  const [viewing, setViewing] = useState<Specialty | null>(null);
  const [deleting, setDeleting] = useState<Specialty | null>(null);

  const filtered = specialties.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active' && !s.isActive) return false;
    if (filter === 'inactive' && s.isActive) return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { active: stats.active, doctors: stats.totalDoctors, mockup: 'Mockup B.36' })}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('newButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}    value={stats.total}        sub={t('kpiTotalSub')}    color="text-text-1" />
        <KpiCard label={t('kpiActive')}   value={stats.active}       sub={t('kpiActiveSub')}   color="text-emerald" />
        <KpiCard label={t('kpiInactive')} value={stats.inactive}     sub={t('kpiInactiveSub')} color="text-rose" />
        <KpiCard label={t('kpiDoctors')}  value={stats.totalDoctors} sub={t('kpiDoctorsSub')}  color="text-brand" />
      </div>

      {/* Filter row */}
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
        <FilterPill active={filter === 'all'}     onClick={() => setFilter('all')}     label={tc('all')}      count={stats.total} />
        <FilterPill active={filter === 'active'}  onClick={() => setFilter('active')}  label={tc('active')}   count={stats.active} />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={tc('inactive')} count={stats.inactive} />
      </div>

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>{t('columnName')}</DataTable.Th>
              <DataTable.Th>{t('columnDescription')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnWorkflow')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnCpt')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnDoctors')}</DataTable.Th>
              <DataTable.Th align="center">{t('columnStatus')}</DataTable.Th>
              <DataTable.Th align="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <DataTable.Td colSpan={7}>
                    <EmptyState.Inline
                      message={search ? `No hay especialidades que coincidan con "${search}"` : 'No hay especialidades. Crea la primera arriba.'}
                    />
                  </DataTable.Td>
                </tr>
              ) : (
                filtered.map((sp) => (
                  <DataTable.Row key={sp.id}>
                    <DataTable.Td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: sp.color, boxShadow: `0 0 8px ${sp.color}80` }}
                        />
                        <span className="text-text-1 font-semibold">{sp.name}</span>
                      </div>
                    </DataTable.Td>
                    <DataTable.Td className="text-text-2 text-[12.5px] max-w-md">
                      {sp.description ? (
                        <span className="line-clamp-1">{sp.description}</span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <WorkflowPill type={sp.workflowType} />
                    </DataTable.Td>
                    <DataTable.Td align="center" className="text-text-2 font-mono text-xs">
                      {sp.cptSuggested.length > 0 ? (
                        <span title={sp.cptSuggested.join(', ')}>
                          {sp.cptSuggested.slice(0, 2).join(', ')}
                          {sp.cptSuggested.length > 2 && (
                            <span className="text-text-muted"> +{sp.cptSuggested.length - 2}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </DataTable.Td>
                    <DataTable.Td align="center" className="text-text-1 font-mono font-semibold">
                      {sp.doctorCount}
                    </DataTable.Td>
                    <DataTable.Td align="center">
                      <StatusPill
                        state={sp.isActive ? 'active' : 'inactive'}
                        label={sp.isActive ? 'Activa' : 'Inactiva'}
                      />
                    </DataTable.Td>
                    <DataTable.Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction onClick={() => setViewing(sp)} icon={Eye} label="Ver" />
                        <IconAction onClick={() => setEditing(sp)} icon={Pencil} label="Editar" />
                        <IconAction onClick={() => { /* permissions tbd */ }} icon={KeyRound} label="Permisos" disabled />
                        <IconAction onClick={() => setDeleting(sp)} icon={Trash2} label="Eliminar" variant="danger" />
                      </div>
                    </DataTable.Td>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={`${filtered.length} de ${stats.total} especialidades`}
          right={<span className="font-mono">phoenix-dev · local</span>}
        />
      </DataTable.Card>

      {/* Modals */}
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
          refresh();
        }}
      />

      <ViewDialog
        specialty={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => {
          setEditing(viewing);
          setViewing(null);
        }}
      />

      <DeleteConfirmDialog
        specialty={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={() => {
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
}

// ─── Domain pills ───────────────────────────────────────────────────────────

/** WorkflowPill — Pill custom para tipo de workflow (MVA/GM/SELFPAY/NURSING_HOME).
 *  Usa TagPill del shared con color por dominio. */
function WorkflowPill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    MVA:           'bg-rose/15 text-rose border-rose/30',
    GM:            'bg-emerald/15 text-emerald border-emerald/30',
    SELFPAY:       'bg-pink/15 text-pink border-pink/30',
    NURSING_HOME:  'bg-amber/15 text-amber border-amber/30',
  };
  return <TagPill label={type} colorClass={colors[type] ?? 'bg-white/5 text-text-2 border-border'} mono />;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

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
  const [name, setName]                 = useState(editing?.name ?? '');
  const [description, setDescription]   = useState(editing?.description ?? '');
  const [color, setColor]               = useState(editing?.color ?? COLOR_PALETTE[0]);
  const [workflowType, setWorkflowType] = useState(editing?.workflowType ?? 'MVA');
  const [caseType, setCaseType]         = useState(editing?.caseType ?? 'MVA');
  const [cptInput, setCptInput]         = useState(editing?.cptSuggested.join(', ') ?? '');
  const [isActive, setIsActive]         = useState(editing?.isActive ?? true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Reset when editing changes
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
    if (!name.trim()) return setError('El nombre es obligatorio');
    setSaving(true);
    try {
      const cptArray = cptInput.split(',').map((c) => c.trim()).filter(Boolean);
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar — ${editing.name}` : 'Nueva especialidad'}</DialogTitle>
          <DialogDescription>
            Define el service line. Se consume en B.10 calendar, B.17 "Mi día", B.21 firma de nota.
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
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Descripción opcional del service line..."
            />
          </div>

          <div>
            <Label>Color · identificador en calendario y dashboard</Label>
            <div className="flex gap-2 mt-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-md transition-all ${
                    color === c ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg-1 scale-110' : 'hover:scale-105'
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
                  <option key={w.value} value={w.value}>{w.label}</option>
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
                {CASE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="cptInput">
              CPT codes sugeridos
              <span className="text-text-muted text-xs ml-1 font-normal">(separados por coma · pre-cargan en B.21)</span>
            </Label>
            <Input
              id="cptInput"
              value={cptInput}
              onChange={(e) => setCptInput(e.target.value)}
              placeholder="99213, 99214, 98941"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm text-text-2">Especialidad activa</span>
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
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear especialidad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({
  specialty,
  onClose,
  onEdit,
}: {
  specialty: Specialty | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!specialty) return null;
  return (
    <Dialog open={!!specialty} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: specialty.color, boxShadow: `0 0 12px ${specialty.color}80` }}
            />
            {specialty.name}
          </DialogTitle>
          <DialogDescription>{specialty.description ?? 'Sin descripción'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4 text-sm">
          <InfoRow label="Workflow"      value={<WorkflowPill type={specialty.workflowType} />} />
          <InfoRow label="Case type"     value={<code className="text-xs text-text-2 font-mono">{specialty.caseType}</code>} />
          <InfoRow label="Color"         value={
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-white/20" style={{ background: specialty.color }} />
              <code className="text-xs text-text-2 font-mono">{specialty.color}</code>
            </div>
          } />
          <InfoRow label="CPT sugeridos" value={
            specialty.cptSuggested.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {specialty.cptSuggested.map((c) => (
                  <code key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-2 border border-border text-text-2">{c}</code>
                ))}
              </div>
            ) : (
              <span className="text-text-muted italic text-xs">Ninguno</span>
            )
          } />
          <InfoRow label="Doctores"      value={<span className="font-mono text-text-1">{specialty.doctorCount}</span>} />
          <InfoRow label="Estado"        value={
            <StatusPill
              state={specialty.isActive ? 'active' : 'inactive'}
              label={specialty.isActive ? 'Activa' : 'Inactiva'}
            />
          } />
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
    <div className="grid grid-cols-3 gap-3 items-center py-1.5 border-b border-border/30 last:border-0">
      <div className="text-text-muted text-xs uppercase tracking-wider font-semibold">{label}</div>
      <div className="col-span-2">{value}</div>
    </div>
  );
}

function DeleteConfirmDialog({
  specialty,
  onClose,
  onConfirmed,
}: {
  specialty: Specialty | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!specialty) return null;

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/specialties?id=${specialty.id}`, { method: 'DELETE' });
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
    <Dialog open={!!specialty} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-rose">Eliminar especialidad</DialogTitle>
          <DialogDescription>
            ¿Seguro que querés eliminar <strong className="text-text-1">"{specialty.name}"</strong>? Se hace soft-delete (queda inactiva, no se borra del DB).
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 text-sm text-text-2">
          {specialty.doctorCount > 0 && (
            <div className="bg-amber/10 border border-amber/30 rounded-md p-3 mb-3 text-amber text-xs">
              ⚠ Tiene <strong>{specialty.doctorCount} doctor{specialty.doctorCount > 1 ? 'es' : ''}</strong> asignado{specialty.doctorCount > 1 ? 's' : ''}. Revisa antes de continuar.
            </div>
          )}
          <p className="text-xs text-text-muted">El registro queda con <code className="text-text-2">deletedAt</code> seteado. Podés revertirlo manualmente desde DB si hace falta.</p>
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
