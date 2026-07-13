'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search as SearchIcon, Phone, Mail, Stethoscope, Pencil, Trash2 } from 'lucide-react';
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
  DataTable,
  TableFooter,
  EmptyState,
  PersonAvatar,
} from '@/components/ui-phoenix';

// Catálogo de doctores/providers

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  specialty: string;
  licenseNumber: string | null;
  status: string;
  appointmentCount: number;
}

interface Props {
  providers: Provider[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    bySpecialty: Record<string, number>;
  };
}

const SPECIALTY_LABELS: Record<string, string> = {
  CHIROPRACTIC:     'Quiropráctica',
  GENERAL:          'Medicina General',
  NEUROLOGY:        'Neurología',
  ORTHOPEDICS:      'Ortopedia',
  OTHER:            'Otra',
  PAIN_MANAGEMENT:  'Manejo del Dolor',
  PHYSICAL_THERAPY: 'Terapia Física',
  PSYCHOLOGY:       'Psicología',
  RADIOLOGY:        'Radiología',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:           'Activo',
  INACTIVE:         'Inactivo',
  PENDING_APPROVAL: 'Pendiente',
  TERMINATED:       'Terminado',
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialty: 'GENERAL' as string,
  licenseNumber: '',
  status: 'ACTIVE' as string,
};

export function ProvidersClient({ providers, stats }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const filtered = providers.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      if (!name.includes(q) && !(p.email ?? '').toLowerCase().includes(q)) return false;
    }
    if (filter === 'active'   && p.status !== 'ACTIVE') return false;
    if (filter === 'inactive' && p.status === 'ACTIVE') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(p: Provider) {
    setForm({
      firstName:     p.firstName,
      lastName:      p.lastName,
      email:         p.email ?? '',
      phone:         p.phone ?? '',
      specialty:     p.specialty,
      licenseNumber: p.licenseNumber ?? '',
      status:        p.status,
    });
    setError(null);
    setEditing(p);
  }

  async function handleSave(isEdit: boolean) {
    setSaving(true);
    setError(null);
    try {
      const body = isEdit ? { ...form, id: editing!.id } : form;
      const res = await fetch('/api/admin/providers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? data.error ?? 'Error al guardar');
      }
      setCreateOpen(false);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/providers?id=${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const FormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" value={form.firstName} onChange={set('firstName')} placeholder="Nombre" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Apellido</Label>
          <Input id="lastName" value={form.lastName} onChange={set('lastName')} placeholder="Apellido" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="doctor@clinica.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="(801) 555-0100" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="specialty">Especialidad</Label>
          <select
            id="specialty"
            value={form.specialty}
            onChange={set('specialty')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {Object.entries(SPECIALTY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            value={form.status}
            onChange={set('status')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="licenseNumber">Número de Licencia</Label>
        <Input id="licenseNumber" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="NPI o licencia estatal" />
      </div>
      {error && (
        <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctores / Providers"
        subtitle={`${stats.active} activos · ${stats.total} total`}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo Doctor
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total"    value={stats.total}    sub="registrados"   color="text-text-1" />
        <KpiCard label="Activos"  value={stats.active}   sub="en servicio"   color="text-emerald" />
        <KpiCard label="Quiro."   value={stats.bySpecialty['CHIROPRACTIC'] ?? 0}  sub="Quiropráctica"  color="text-violet" />
        <KpiCard label="Medicina" value={stats.bySpecialty['GENERAL'] ?? 0}       sub="General"        color="text-cyan" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label="Todos" />
        <FilterPill active={filter === 'active'}   onClick={() => setFilter('active')}   label="Activos" />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label="Inactivos" />
      </div>

      {/* Table */}
      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>Doctor</DataTable.Th>
              <DataTable.Th>Especialidad</DataTable.Th>
              <DataTable.Th>Contacto</DataTable.Th>
              <DataTable.Th>Licencia</DataTable.Th>
              <DataTable.Th>Estado</DataTable.Th>
              <DataTable.Th align="right">Citas</DataTable.Th>
              <DataTable.Th align="right">Acciones</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState.Inline message={search ? `Sin resultados para "${search}"` : 'No hay doctores aún'} />
                  </td>
                </tr>
              ) : filtered.map((p) => (
                <DataTable.Row key={p.id} muted={p.status !== 'ACTIVE'}>
                  <DataTable.Td>
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} />
                      <p className="text-sm font-medium text-text-1">{p.firstName} {p.lastName}</p>
                    </div>
                  </DataTable.Td>
                  <DataTable.Td>
                    <span className="text-sm text-text-2">{SPECIALTY_LABELS[p.specialty] ?? p.specialty}</span>
                  </DataTable.Td>
                  <DataTable.Td>
                    <div className="space-y-0.5">
                      {p.email && (
                        <div className="flex items-center gap-1 text-[11px] text-text-muted">
                          <Mail className="w-3 h-3" /> {p.email}
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-1 text-[11px] text-text-muted">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </div>
                      )}
                    </div>
                  </DataTable.Td>
                  <DataTable.Td>
                    <span className="text-[11px] font-mono text-text-muted">{p.licenseNumber ?? '—'}</span>
                  </DataTable.Td>
                  <DataTable.Td>
                    <StatusPill
                      state={p.status === 'ACTIVE' ? 'active' : p.status === 'PENDING_APPROVAL' ? 'warning' : 'inactive'}
                      label={STATUS_LABELS[p.status] ?? p.status}
                    />
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <span className="text-sm tabular-nums">{p.appointmentCount}</span>
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <div className="flex items-center gap-1 justify-end">
                      <IconAction icon={Pencil} label="Editar"    onClick={() => openEdit(p)} />
                      <IconAction icon={Trash2} label="Eliminar"  variant="danger" onClick={() => setDeleting(p)} />
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter left={`${filtered.length} de ${providers.length} doctores`} />
      </DataTable.Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Doctor</DialogTitle>
            <DialogDescription>Agregar un doctor o proveedor al catálogo.</DialogDescription>
          </DialogHeader>
          <FormFields />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'Guardando…' : 'Crear Doctor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Doctor</DialogTitle>
          </DialogHeader>
          <FormFields />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Doctor</DialogTitle>
            <DialogDescription>
              ¿Eliminar a <strong>{deleting?.firstName} {deleting?.lastName}</strong>? Esta acción es reversible desde base de datos.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleting(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={saving}>
              {saving ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
