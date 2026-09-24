'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, Phone, Mail, Pencil, Trash2, Link2, LinkIcon } from 'lucide-react';
import { npiValido, npiFormaSospechosa } from '@/lib/npi';
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

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  specialty: string;
  licenseNumber: string | null;
  npi: string | null;
  status: string;
  appointmentCount: number;
  employeeId: string | null;
  employee: { id: string; firstName: string; lastName: string } | null;
}

interface DoctorEmployee {
  id: string;
  name: string;
  linkedProviderId: string | null;
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

/** Solo el ORDEN del selector: la etiqueta vive en `spec*` del diccionario. */
const SPECIALTIES = [
  'CHIROPRACTIC', 'GENERAL', 'NEUROLOGY', 'ORTHOPEDICS', 'OTHER',
  'PAIN_MANAGEMENT', 'PHYSICAL_THERAPY', 'PSYCHOLOGY', 'RADIOLOGY',
] as const;

/** Ídem para el estado — la etiqueta vive en `stActive`, `stInactive`, … */
const STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED'] as const;

/** El estado no se llama igual que su clave: `PENDING_APPROVAL` → `stPending`. */
const STATUS_KEY: Record<string, string> = {
  ACTIVE: 'stActive',
  INACTIVE: 'stInactive',
  PENDING_APPROVAL: 'stPending',
  TERMINATED: 'stTerminated',
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialty: 'GENERAL' as string,
  licenseNumber: '',
  npi: '',
  status: 'ACTIVE' as string,
  employeeId: '' as string,
};

export function ProvidersClient({ providers, stats }: Props) {
  const t = useTranslations('phoenix.providers');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'active' | 'inactive' | 'unlinked'>('all');
  const [editing, setEditing]   = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [doctorEmployees, setDoctorEmployees] = useState<DoctorEmployee[]>([]);

  useEffect(() => {
    fetch('/api/admin/employees/doctors')
      .then(r => r.ok ? r.json() : { doctors: [] })
      .then(d => setDoctorEmployees(d.doctors ?? []));
  }, []);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  /** Vacío es válido: el NPI no es obligatorio para dar de alta al provider, lo
      es para EMITIR una orden de laboratorio, y eso se avisa allá. */
  const npiMal = form.npi.trim() !== '' && !npiValido(form.npi);

  const filtered = providers.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      if (!name.includes(q) && !(p.email ?? '').toLowerCase().includes(q)) return false;
    }
    if (filter === 'active'   && p.status !== 'ACTIVE') return false;
    if (filter === 'inactive' && p.status === 'ACTIVE') return false;
    if (filter === 'unlinked' && p.employeeId) return false;
    return true;
  });

  const unlinkedCount = providers.filter(p => !p.employeeId).length;

  const refresh = () => startTransition(() => router.refresh());

  function openEdit(p: Provider) {
    setForm({
      firstName:     p.firstName,
      lastName:      p.lastName,
      email:         p.email ?? '',
      phone:         p.phone ?? '',
      specialty:     p.specialty,
      licenseNumber: p.licenseNumber ?? '',
      npi:           p.npi ?? '',
      status:        p.status,
      employeeId:    p.employeeId ?? '',
    });
    setError(null);
    setEditing(p);
  }

  async function handleSave() {
    // El servidor lo rechaza igual; esto es para que el motivo se vea en el
    // campo y no como un error genérico al final del formulario.
    if (npiMal) { setError('Revisá el NPI: no pasa el dígito verificador.'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        id: editing!.id,
        ...form,
        employeeId: form.employeeId || null,
      };
      const res = await fetch('/api/admin/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? data.error ?? 'Error al guardar');
      }
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/providers?id=${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('errorDelete'));
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  // Employees disponibles para vincular (excluye los ya vinculados a otro provider)
  const availableEmployees = (currentProviderId?: string) =>
    doctorEmployees.filter(
      d => !d.linkedProviderId || d.linkedProviderId === currentProviderId
    );

  const FormFields = ({ providerId }: { providerId?: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">{t('fieldFirstName')}</Label>
          <Input id="firstName" value={form.firstName} onChange={set('firstName')} placeholder={t('fieldFirstName')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">{t('fieldLastName')}</Label>
          <Input id="lastName" value={form.lastName} onChange={set('lastName')} placeholder={t('fieldLastName')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('fieldEmail')}</Label>
          <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder={t('phEmail')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t('fieldPhone')}</Label>
          <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="(801) 555-0100" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="specialty">{t('fieldSpecialty')}</Label>
          <select
            id="specialty"
            value={form.specialty}
            onChange={set('specialty')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {SPECIALTIES.map((val) => (
              <option key={val} value={val}>{t(`spec${val}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">{t('fieldStatus')}</Label>
          <select
            id="status"
            value={form.status}
            onChange={set('status')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {STATUSES.map((val) => (
              <option key={val} value={val}>{t(STATUS_KEY[val] ?? val)}</option>
            ))}
          </select>
        </div>
      </div>
      {/*
        * Licencia y NPI son DOS campos, no uno.
        *
        * Había un solo input rotulado "Número de Licencia / NPI" que escribía
        * solo en `licenseNumber`, así que la columna `npi` no se podía llenar
        * desde acá y quedó vacía: medido el 2026-09-10, de 20 providers el
        * único valor en `npi` era relleno que no pasa el verificador, y el
        * único NPI real de la clínica estaba escrito en el campo de licencia.
        * Son identificadores distintos —la licencia es estatal, el NPI es
        * nacional— y **LabCorp exige el NPI en la orden de laboratorio**: sin
        * él la hoja no se procesa.
        */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="licenseNumber">{t('fieldLicense')}</Label>
          <Input id="licenseNumber" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder={t('phLicense')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="npi">NPI</Label>
          <Input
            id="npi"
            value={form.npi}
            onChange={set('npi')}
            inputMode="numeric"
            maxLength={10}
            placeholder={t('phNpi')}
            aria-invalid={npiMal || undefined}
            className={npiMal ? '!border-rose focus:!border-rose' : undefined}
          />
          {/* El verificador es lo que separa un NPI de diez dígitos cualquiera:
              `9906372145` tiene diez y es falso. Se avisa al escribir, no al
              guardar, porque el número se copia de otra pantalla y el error se
              corrige en el acto. */}
          {npiMal && (
            <p className="text-[11px] text-rose">
              Ese NPI no es válido. Son 10 dígitos y el último es un verificador —
              revisá que no falte o sobre un número.
            </p>
          )}
          {!npiMal && form.npi.trim() !== '' && npiFormaSospechosa(form.npi) && (
            <p className="text-[11px] text-amber">
              Válido, pero los NPI reales empiezan en 1 o 2. Verificá que sea el correcto.
            </p>
          )}
        </div>
      </div>

      {/* Vínculo con empleado HR */}
      <div className="space-y-1.5">
        <Label htmlFor="employeeId" className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-brand-text" />
          Empleado vinculado (HR)
        </Label>
        <select
          id="employeeId"
          value={form.employeeId}
          onChange={set('employeeId')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">{t('noLinkOption')}</option>
          {availableEmployees(providerId).map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <p className="text-[11px] text-text-muted">
          Solo aparecen empleados con cargo Provider no vinculados a otro perfil clínico.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { activos: stats.active, total: stats.total })}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}    value={stats.total}    sub={t('kpiTotalSub')}    color="text-text-1" />
        <KpiCard label={t('kpiActive')}   value={stats.active}   sub={t('kpiActiveSub')}   color="text-emerald" />
        <KpiCard label={t('kpiLinked')}   value={stats.total - unlinkedCount} sub={t('kpiLinkedSub')} color="text-brand-text" />
        <KpiCard label={t('kpiUnlinked')} value={unlinkedCount} sub={t('kpiUnlinkedSub')} color={unlinkedCount > 0 ? 'text-amber' : 'text-text-muted'} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label={t('filterAll')} />
        <FilterPill active={filter === 'active'}   onClick={() => setFilter('active')}   label={t('filterActive')} />
        <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} label={t('filterInactive')} />
        {unlinkedCount > 0 && (
          <FilterPill active={filter === 'unlinked'} onClick={() => setFilter('unlinked')} label={t('filterUnlinked', { count: unlinkedCount })} />
        )}
      </div>

      {/* Table */}
      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>{t('colProvider')}</DataTable.Th>
              <DataTable.Th>{t('colSpecialty')}</DataTable.Th>
              <DataTable.Th>{t('colContact')}</DataTable.Th>
              <DataTable.Th>{t('colLicense')}</DataTable.Th>
              <DataTable.Th>{t('colEmployee')}</DataTable.Th>
              <DataTable.Th>{t('colStatus')}</DataTable.Th>
              <DataTable.Th align="right">{t('colAppointments')}</DataTable.Th>
              <DataTable.Th align="right">{t('colActions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
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
                    <span className="text-sm text-text-2">{t(`spec${p.specialty}`)}</span>
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
                    {p.employee ? (
                      <div className="flex items-center gap-1.5">
                        <LinkIcon className="w-3 h-3 text-brand-text shrink-0" />
                        <span className="text-[11px] text-text-2">{p.employee.firstName} {p.employee.lastName}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber italic">{t('noLink')}</span>
                    )}
                  </DataTable.Td>
                  <DataTable.Td>
                    <StatusPill
                      state={p.status === 'ACTIVE' ? 'active' : p.status === 'PENDING_APPROVAL' ? 'warning' : 'inactive'}
                      label={t(STATUS_KEY[p.status] ?? p.status)}
                    />
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <span className="text-sm tabular-nums">{p.appointmentCount}</span>
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <div className="flex items-center gap-1 justify-end">
                      <IconAction icon={Pencil} label={t('actionEdit')}   onClick={() => openEdit(p)} />
                      <IconAction icon={Trash2} label={t('actionDelete')} variant="danger" onClick={() => setDeleting(p)} />
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter left={`${filtered.length} de ${providers.length} doctores`} />
      </DataTable.Card>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          <FormFields providerId={editing?.id} />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={saving}>{tc('cancel')}</Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave()} disabled={saving}>
              {saving ? t('saving') : t('btnSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteDesc', {
                nombre: `${deleting?.firstName ?? ''} ${deleting?.lastName ?? ''}`.trim(),
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleting(null)} disabled={saving}>{tc('cancel')}</Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={saving}>
              {saving ? t('deleting') : t('btnDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
