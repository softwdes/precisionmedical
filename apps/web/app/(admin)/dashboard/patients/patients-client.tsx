'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label,
} from '@precision-medical/ui';
import { Plus, Building2, Search, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type PatientList = inferRouterOutputs<AppRouter>['patients']['list'];
type Lawyer = inferRouterOutputs<AppRouter>['lawyers']['list']['items'][number];
type Provider = inferRouterOutputs<AppRouter>['providers']['list']['items'][number];

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'secondary' | 'warning' | 'destructive'> = {
  NEW: 'info',
  ACTIVE: 'success',
  COMPLETED: 'secondary',
  DISCHARGED: 'warning',
  INACTIVE: 'destructive',
};

const ACCIDENT_TYPES = ['AUTO', 'MOTORCYCLE', 'PEDESTRIAN', 'WORKPLACE', 'OTHER'] as const;

export function PatientsClient({
  initial, lawyers, providers,
}: {
  initial: PatientList;
  lawyers: Lawyer[];
  providers: Provider[];
}): React.ReactElement {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = trpc.patients.list.useQuery(
    { page, search: search || undefined, status: statusFilter as 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE' | undefined },
    { initialData: initial },
  );

  const STATUS_LABELS: Record<string, string> = {
    NEW: t('patients.statuses.NEW'),
    ACTIVE: t('patients.statuses.ACTIVE'),
    COMPLETED: t('patients.statuses.COMPLETED'),
    DISCHARGED: t('patients.statuses.DISCHARGED'),
    INACTIVE: t('patients.statuses.INACTIVE'),
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('patients.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('patients.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('patients.addNew')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-3" />
          <Input
            className="pl-9"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.status')}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Mobile */}
        <div className="md:hidden divide-y divide-border">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('patients.noPatients')}</div>
          ) : (
            (data?.items ?? []).map((patient) => {
              const lawyer = patient.lawyerReferrer as { firstName?: string; lastName?: string; firmName?: string } | null;
              return (
                <Link key={patient.id} href={`/dashboard/patients/${patient.id}`} className="flex items-center px-4 py-3.5 gap-3 hover:bg-surface/80">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald/10 shrink-0">
                    <Building2 className="h-4 w-4 text-emerald" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-semibold text-text-1 truncate">{patient.firstName} {patient.lastName}</p>
                    <p className="text-tiny text-text-muted font-mono">{patient.patientCode}</p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[patient.status] ?? 'secondary'}>{STATUS_LABELS[patient.status] ?? patient.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-text-muted" />
                </Link>
              );
            })
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('patients.patientCode')}</TableHead>
                <TableHead>{t('patients.firstName')}</TableHead>
                <TableHead>{t('patients.accidentType')}</TableHead>
                <TableHead>{t('patients.lawyerReferrer')}</TableHead>
                <TableHead>{t('patients.status')}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('patients.noPatients')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((patient) => {
                  const lawyer = patient.lawyerReferrer as { firstName?: string; lastName?: string; firmName?: string } | null;
                  const lawyerName = lawyer ? (lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim()) : '—';
                  return (
                    <TableRow key={patient.id}>
                      <TableCell className="font-mono text-small text-text-2">{patient.patientCode}</TableCell>
                      <TableCell>
                        <Link href={`/dashboard/patients/${patient.id}`} className="block">
                          <p className="text-small font-medium text-text-1">{patient.firstName} {patient.lastName}</p>
                          {patient.email && <p className="text-tiny text-text-muted">{patient.email}</p>}
                        </Link>
                      </TableCell>
                      <TableCell className="text-small text-text-2">
                        {patient.accidentType ? t(`patients.accidentTypes.${patient.accidentType}`) : '—'}
                      </TableCell>
                      <TableCell className="text-small text-text-2">{lawyerName}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANTS[patient.status] ?? 'secondary'}>{STATUS_LABELS[patient.status] ?? patient.status}</Badge></TableCell>
                      <TableCell>
                        <Link href={`/dashboard/patients/${patient.id}`}>
                          <ChevronRight className="h-4 w-4 text-text-muted hover:text-brand transition-colors" />
                        </Link>
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

      <CreatePatientDialog
        open={showCreate}
        lawyers={lawyers}
        providers={providers}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function CreatePatientDialog({
  open, lawyers, providers, onClose, onCreated,
}: {
  open: boolean;
  lawyers: Lawyer[];
  providers: Provider[];
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    accidentType: '' as '' | typeof ACCIDENT_TYPES[number],
    insuranceCarrier: '',
    policyNumber: '',
    lawyerReferrerId: '',
    providerReferrerId: '',
    accidentDate: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.patients.create.useMutation({
    onSuccess: () => { toast.success(t('patients.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('patients.createPatient')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('patients.firstName')} *</Label>
              <Input value={form.firstName} onChange={(e) => f('firstName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('patients.lastName')} *</Label>
              <Input value={form.lastName} onChange={(e) => f('lastName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('patients.email')}</Label>
              <Input type="email" value={form.email} onChange={(e) => f('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('patients.phone')}</Label>
              <Input type="tel" value={form.phone} onChange={(e) => f('phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('patients.accidentDate')}</Label>
              <Input type="date" value={form.accidentDate} onChange={(e) => f('accidentDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('patients.accidentType')}</Label>
              <Select value={form.accidentType} onValueChange={(v) => f('accidentType', v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {ACCIDENT_TYPES.map(a => <SelectItem key={a} value={a}>{t(`patients.accidentTypes.${a}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('patients.insuranceCarrier')}</Label>
              <Input value={form.insuranceCarrier} onChange={(e) => f('insuranceCarrier', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('patients.policyNumber')}</Label>
              <Input value={form.policyNumber} onChange={(e) => f('policyNumber', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('patients.lawyerReferrer')}</Label>
            <Select value={form.lawyerReferrerId} onValueChange={(v) => f('lawyerReferrerId', v === 'NONE' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">—</SelectItem>
                {lawyers.map(l => {
                  const name = l.entityType === 'FIRM' ? (l.firmName ?? l.email) : `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim();
                  return <SelectItem key={l.id} value={l.id}>{name}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('patients.providerReferrer')}</Label>
            <Select value={form.providerReferrerId} onValueChange={(v) => f('providerReferrerId', v === 'NONE' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">—</SelectItem>
                {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.firstName || !form.lastName}
            onClick={() => create.mutate({
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email || undefined,
              phone: form.phone || undefined,
              accidentType: form.accidentType || undefined,
              accidentDate: form.accidentDate || undefined,
              insuranceCarrier: form.insuranceCarrier || undefined,
              policyNumber: form.policyNumber || undefined,
              lawyerReferrerId: form.lawyerReferrerId || undefined,
              providerReferrerId: form.providerReferrerId || undefined,
            })}
          >
            {t('patients.createPatient')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
