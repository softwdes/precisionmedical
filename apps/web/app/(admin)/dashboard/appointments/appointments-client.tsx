'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
} from '@precision/ui';
import { Plus, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ApptList = inferRouterOutputs<AppRouter>['appointments']['list'];
type Clinic = inferRouterOutputs<AppRouter>['appointments']['listClinics'][number];
type Patient = inferRouterOutputs<AppRouter>['patients']['list']['items'][number];
type Provider = inferRouterOutputs<AppRouter>['providers']['list']['items'][number];

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  SCHEDULED: 'info',
  CONFIRMED: 'success',
  IN_PROGRESS: 'info',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
  NO_SHOW: 'warning',
  PENDING: 'warning',
};

const APPT_TYPES = ['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP', 'CONSULTATION'] as const;
const APPT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING'] as const;

export function AppointmentsClient({
  initial, clinics, patients, providers,
}: {
  initial: ApptList;
  clinics: Clinic[];
  patients: Patient[];
  providers: Provider[];
}): React.ReactElement {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = trpc.appointments.list.useQuery(
    {
      page,
      status: statusFilter as typeof APPT_STATUSES[number] | undefined,
      type: typeFilter as typeof APPT_TYPES[number] | undefined,
      clinicId: clinicFilter || undefined,
    },
    { initialData: initial },
  );

  const updateStatus = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { toast.success(t('appointments.updated')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const STATUS_LABELS: Record<string, string> = Object.fromEntries(
    APPT_STATUSES.map(s => [s, t(`appointments.statuses.${s}`)]),
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('appointments.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('appointments.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('appointments.addNew')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={clinicFilter} onValueChange={(v) => { setClinicFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('appointments.allClinics')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('appointments.allClinics')}</SelectItem>
            {clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('appointments.allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('appointments.allTypes')}</SelectItem>
            {APPT_TYPES.map(type => <SelectItem key={type} value={type}>{t(`appointments.types.${type}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('appointments.allStatuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('appointments.allStatuses')}</SelectItem>
            {APPT_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Mobile */}
        <div className="md:hidden divide-y divide-border">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('appointments.noAppointments')}</div>
          ) : (
            (data?.items ?? []).map((appt) => {
              const patient = appt.patient as unknown as { patientCode: string; firstName: string; lastName: string } | null;
              const clinic = appt.clinic as unknown as { name: string } | null;
              return (
                <div key={appt.id} className="px-4 py-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-text-1 truncate">{patient?.firstName} {patient?.lastName}</p>
                      <p className="text-tiny text-text-3">{clinic?.name} · {t(`appointments.types.${appt.type}`)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={STATUS_VARIANTS[appt.status] ?? 'secondary'}>{STATUS_LABELS[appt.status] ?? appt.status}</Badge>
                      <p className="text-tiny text-text-muted">{new Date(appt.scheduledFor).toLocaleString()}</p>
                    </div>
                  </div>
                  {appt.status === 'SCHEDULED' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'CONFIRMED' })}>
                        {t('appointments.confirmed')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'CANCELLED' })}>
                        {t('appointments.cancelled')}
                      </Button>
                    </div>
                  )}
                  {appt.status === 'CONFIRMED' && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'COMPLETED' })}>
                      {t('appointments.completed')}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('appointments.patient')}</TableHead>
                <TableHead>{t('appointments.clinic')}</TableHead>
                <TableHead>{t('appointments.type')}</TableHead>
                <TableHead>{t('appointments.scheduledFor')}</TableHead>
                <TableHead>{t('appointments.status')}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('appointments.noAppointments')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((appt) => {
                  const patient = appt.patient as unknown as { id: string; patientCode: string; firstName: string; lastName: string } | null;
                  const clinic = appt.clinic as unknown as { name: string } | null;
                  const provider = appt.provider as unknown as { firstName: string; lastName: string } | null;
                  return (
                    <TableRow key={appt.id}>
                      <TableCell>
                        <p className="text-small font-medium text-text-1">{patient?.firstName} {patient?.lastName}</p>
                        <p className="text-tiny font-mono text-text-muted">{patient?.patientCode}</p>
                      </TableCell>
                      <TableCell className="text-small text-text-2">{clinic?.name ?? '—'}</TableCell>
                      <TableCell className="text-small text-text-2">{t(`appointments.types.${appt.type}`)}</TableCell>
                      <TableCell className="text-small text-text-2">{new Date(appt.scheduledFor).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANTS[appt.status] ?? 'secondary'}>{STATUS_LABELS[appt.status] ?? appt.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {appt.status === 'SCHEDULED' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'CONFIRMED' })}>✓</Button>
                              <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'CANCELLED' })}>✕</Button>
                            </>
                          )}
                          {appt.status === 'CONFIRMED' && (
                            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appt.id, status: 'COMPLETED' })}>
                              {t('appointments.completed')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      <CreateAppointmentDialog
        open={showCreate}
        patients={patients}
        clinics={clinics}
        providers={providers}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function CreateAppointmentDialog({
  open, patients, clinics, providers, onClose, onCreated,
}: {
  open: boolean;
  patients: Patient[];
  clinics: Clinic[];
  providers: Provider[];
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    patientId: '',
    clinicId: '',
    providerId: '',
    scheduledFor: '',
    durationMinutes: '30',
    type: 'AUTO_ACCIDENT' as typeof APPT_TYPES[number],
    notes: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.appointments.create.useMutation({
    onSuccess: () => { toast.success(t('appointments.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('appointments.createAppointment')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('appointments.patient')} *</Label>
            <Select value={form.patientId} onValueChange={(v) => f('patientId', v)}>
              <SelectTrigger><SelectValue placeholder={t('appointments.patient')} /></SelectTrigger>
              <SelectContent>
                {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('appointments.clinic')} *</Label>
            <Select value={form.clinicId} onValueChange={(v) => f('clinicId', v)}>
              <SelectTrigger><SelectValue placeholder={t('appointments.clinic')} /></SelectTrigger>
              <SelectContent>
                {clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('appointments.provider')}</Label>
            <Select value={form.providerId} onValueChange={(v) => f('providerId', v === 'NONE' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">—</SelectItem>
                {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('appointments.scheduledFor')} *</Label>
              <Input type="datetime-local" value={form.scheduledFor} onChange={(e) => f('scheduledFor', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('appointments.duration')}</Label>
              <Input type="number" min="15" step="15" value={form.durationMinutes} onChange={(e) => f('durationMinutes', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('appointments.type')} *</Label>
            <Select value={form.type} onValueChange={(v) => f('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APPT_TYPES.map(type => <SelectItem key={type} value={type}>{t(`appointments.types.${type}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('appointments.notes')}</Label>
            <Input value={form.notes} onChange={(e) => f('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.patientId || !form.clinicId || !form.scheduledFor}
            onClick={() => create.mutate({
              patientId: form.patientId,
              clinicId: form.clinicId,
              providerId: form.providerId || undefined,
              scheduledFor: form.scheduledFor,
              durationMinutes: Number(form.durationMinutes),
              type: form.type,
              notes: form.notes || undefined,
            })}
          >
            {t('appointments.createAppointment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
