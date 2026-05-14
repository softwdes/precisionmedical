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
} from '@precision/ui';
import { Plus, Stethoscope, Search, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ProviderList = inferRouterOutputs<AppRouter>['providers']['list'];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  INACTIVE: 'secondary',
  TERMINATED: 'destructive',
};

const SPECIALTIES = ['RADIOLOGY', 'NEUROLOGY', 'ORTHOPEDICS', 'PHYSICAL_THERAPY', 'CHIROPRACTIC', 'PAIN_MANAGEMENT', 'PSYCHOLOGY', 'GENERAL', 'OTHER'] as const;

export function ProvidersClient({ initial }: { initial: ProviderList }): React.ReactElement {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = trpc.providers.list.useQuery(
    {
      page,
      search: search || undefined,
      status: statusFilter as 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL' | 'TERMINATED' | undefined,
      specialty: specialtyFilter as typeof SPECIALTIES[number] | undefined,
    },
    { initialData: initial },
  );

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('providers.statuses.ACTIVE'),
    INACTIVE: t('providers.statuses.INACTIVE'),
    PENDING_APPROVAL: t('providers.statuses.PENDING_APPROVAL'),
    TERMINATED: t('providers.statuses.TERMINATED'),
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('providers.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('providers.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('providers.addNew')}
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
        <Select value={specialtyFilter} onValueChange={(v) => { setSpecialtyFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('providers.specialty')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('providers.specialty')}: {t('common.noData')}</SelectItem>
            {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{t(`providers.specialties.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
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
            <div className="text-center py-12 text-text-3">{t('providers.noProviders')}</div>
          ) : (
            (data?.items ?? []).map((prov) => (
              <Link key={prov.id} href={`/dashboard/providers/${prov.id}`} className="flex items-center px-4 py-3.5 gap-3 hover:bg-surface/80">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan/10 shrink-0">
                  <Stethoscope className="h-4 w-4 text-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-small font-semibold text-text-1 truncate">{prov.firstName} {prov.lastName}</p>
                  <p className="text-tiny text-text-3">{t(`providers.specialties.${prov.specialty}`)}</p>
                </div>
                <Badge variant={STATUS_VARIANTS[prov.status] ?? 'secondary'}>{STATUS_LABELS[prov.status] ?? prov.status}</Badge>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Link>
            ))
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('providers.firstName')}</TableHead>
                <TableHead>{t('providers.specialty')}</TableHead>
                <TableHead>{t('providers.email')}</TableHead>
                <TableHead>{t('providers.licenseNumber')}</TableHead>
                <TableHead>{t('providers.status')}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('providers.noProviders')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((prov) => (
                  <TableRow key={prov.id}>
                    <TableCell>
                      <Link href={`/dashboard/providers/${prov.id}`} className="block">
                        <p className="text-small font-medium text-text-1">{prov.firstName} {prov.lastName}</p>
                        <p className="text-tiny text-text-muted">{prov.email}</p>
                      </Link>
                    </TableCell>
                    <TableCell className="text-small text-text-2">{t(`providers.specialties.${prov.specialty}`)}</TableCell>
                    <TableCell className="text-small text-text-2">{prov.email}</TableCell>
                    <TableCell className="font-mono text-small text-text-2">{prov.licenseNumber ?? '—'}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[prov.status] ?? 'secondary'}>{STATUS_LABELS[prov.status] ?? prov.status}</Badge></TableCell>
                    <TableCell>
                      <Link href={`/dashboard/providers/${prov.id}`}>
                        <ChevronRight className="h-4 w-4 text-text-muted hover:text-brand transition-colors" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
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

      <CreateProviderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function CreateProviderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialty: 'GENERAL' as typeof SPECIALTIES[number],
    licenseNumber: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.providers.create.useMutation({
    onSuccess: () => { toast.success(t('providers.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('providers.createProvider')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('providers.firstName')} *</Label>
              <Input value={form.firstName} onChange={(e) => f('firstName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('providers.lastName')} *</Label>
              <Input value={form.lastName} onChange={(e) => f('lastName', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('providers.email')} *</Label>
            <Input type="email" value={form.email} onChange={(e) => f('email', e.target.value)} placeholder="proveedor@clinica.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('providers.specialty')} *</Label>
              <Select value={form.specialty} onValueChange={(v) => f('specialty', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{t(`providers.specialties.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('providers.licenseNumber')}</Label>
              <Input value={form.licenseNumber} onChange={(e) => f('licenseNumber', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('providers.phone')}</Label>
            <Input type="tel" value={form.phone} onChange={(e) => f('phone', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.firstName || !form.lastName || !form.email}
            onClick={() => create.mutate({
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              specialty: form.specialty,
              phone: form.phone || undefined,
              licenseNumber: form.licenseNumber || undefined,
            })}
          >
            {t('providers.createProvider')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
