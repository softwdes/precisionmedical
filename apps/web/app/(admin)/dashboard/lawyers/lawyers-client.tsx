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
import { Plus, Scale, Search, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type LawyerList = inferRouterOutputs<AppRouter>['lawyers']['list'];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  INACTIVE: 'secondary',
  TERMINATED: 'destructive',
};

export function LawyersClient({ initial }: { initial: LawyerList }): React.ReactElement {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = trpc.lawyers.list.useQuery(
    { page, search: search || undefined, status: statusFilter as 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL' | 'TERMINATED' | undefined },
    { initialData: initial },
  );

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('lawyers.statuses.ACTIVE'),
    INACTIVE: t('lawyers.statuses.INACTIVE'),
    PENDING_APPROVAL: t('lawyers.statuses.PENDING_APPROVAL'),
    TERMINATED: t('lawyers.statuses.TERMINATED'),
  };

  const ENTITY_LABELS: Record<string, string> = {
    FIRM: t('lawyers.entityTypes.FIRM'),
    INDEPENDENT: t('lawyers.entityTypes.INDEPENDENT'),
    FIRM_MEMBER: t('lawyers.entityTypes.FIRM_MEMBER'),
  };

  const getName = (item: LawyerList['items'][number]): string => {
    if (item.entityType === 'FIRM') return item.firmName ?? '—';
    return [item.firstName, item.lastName].filter(Boolean).join(' ') || '—';
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('lawyers.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('lawyers.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('lawyers.addNew')}
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
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.status')}: {t('common.active')}/{t('common.inactive')}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('lawyers.noLawyers')}</div>
          ) : (
            (data?.items ?? []).map((lawyer) => (
              <Link key={lawyer.id} href={`/dashboard/lawyers/${lawyer.id}`} className="flex items-center px-4 py-3.5 gap-3 hover:bg-surface/80">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 shrink-0">
                  <Scale className="h-4 w-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-small font-semibold text-text-1 truncate">{getName(lawyer)}</p>
                  <p className="text-tiny text-text-3">{ENTITY_LABELS[lawyer.entityType] ?? lawyer.entityType}</p>
                </div>
                <Badge variant={STATUS_VARIANTS[lawyer.status] ?? 'secondary'}>{STATUS_LABELS[lawyer.status] ?? lawyer.status}</Badge>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </Link>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('lawyers.name')}</TableHead>
                <TableHead>{t('lawyers.entityType')}</TableHead>
                <TableHead>{t('lawyers.email')}</TableHead>
                <TableHead>{t('lawyers.phone')}</TableHead>
                <TableHead>{t('lawyers.status')}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('lawyers.noLawyers')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((lawyer) => (
                  <TableRow key={lawyer.id} className="cursor-pointer hover:bg-surface/50">
                    <TableCell>
                      <Link href={`/dashboard/lawyers/${lawyer.id}`} className="block">
                        <p className="text-small font-medium text-text-1">{getName(lawyer)}</p>
                        <p className="text-tiny text-text-muted">{lawyer.email}</p>
                      </Link>
                    </TableCell>
                    <TableCell className="text-small text-text-2">{ENTITY_LABELS[lawyer.entityType] ?? lawyer.entityType}</TableCell>
                    <TableCell className="text-small text-text-2">{lawyer.email}</TableCell>
                    <TableCell className="text-small text-text-2">{lawyer.phone ?? '—'}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[lawyer.status] ?? 'secondary'}>{STATUS_LABELS[lawyer.status] ?? lawyer.status}</Badge></TableCell>
                    <TableCell>
                      <Link href={`/dashboard/lawyers/${lawyer.id}`}>
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

      <CreateLawyerDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function CreateLawyerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    entityType: 'INDEPENDENT' as 'FIRM' | 'INDEPENDENT' | 'FIRM_MEMBER',
    firstName: '',
    lastName: '',
    firmName: '',
    email: '',
    phone: '',
    address: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.lawyers.create.useMutation({
    onSuccess: () => { toast.success(t('lawyers.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  const isFirm = form.entityType === 'FIRM';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('lawyers.createLawyer')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('lawyers.entityType')} *</Label>
            <Select value={form.entityType} onValueChange={(v) => f('entityType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FIRM">{t('lawyers.entityTypes.FIRM')}</SelectItem>
                <SelectItem value="INDEPENDENT">{t('lawyers.entityTypes.INDEPENDENT')}</SelectItem>
                <SelectItem value="FIRM_MEMBER">{t('lawyers.entityTypes.FIRM_MEMBER')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isFirm ? (
            <div className="space-y-1.5">
              <Label>{t('lawyers.firmName')} *</Label>
              <Input value={form.firmName} onChange={(e) => f('firmName', e.target.value)} placeholder={t('lawyers.firmNamePlaceholder')} />
            </div>
          ) : (
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
          )}
          <div className="space-y-1.5">
            <Label>{t('lawyers.email')} *</Label>
            <Input type="email" value={form.email} onChange={(e) => f('email', e.target.value)} placeholder={t('lawyers.emailPlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('lawyers.phone')}</Label>
              <Input type="tel" value={form.phone} onChange={(e) => f('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('lawyers.address')}</Label>
            <Input value={form.address} onChange={(e) => f('address', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.email || (isFirm ? !form.firmName : !form.firstName || !form.lastName)}
            onClick={() => create.mutate({
              entityType: form.entityType,
              email: form.email,
              firstName: !isFirm ? form.firstName : undefined,
              lastName: !isFirm ? form.lastName : undefined,
              firmName: isFirm ? form.firmName : undefined,
              phone: form.phone || undefined,
              address: form.address || undefined,
            })}
          >
            {t('lawyers.createLawyer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
