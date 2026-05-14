'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Label, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@precision-medical/ui';
import { ArrowLeft, Stethoscope, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Provider = inferRouterOutputs<AppRouter>['providers']['getById'];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  INACTIVE: 'secondary',
  TERMINATED: 'destructive',
};

const CURRENCIES = ['USD', 'BOB', 'PEN'] as const;

export function ProviderDetailClient({ provider: initial }: { provider: Provider }): React.ReactElement {
  const t = useTranslations();
  const [showAddTariff, setShowAddTariff] = useState(false);

  const { data: provider, refetch } = trpc.providers.getById.useQuery({ id: initial.id }, { initialData: initial });

  const update = trpc.providers.update.useMutation({
    onSuccess: () => { toast.success(t('providers.updated')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const removeTariff = trpc.providers.removeTariff.useMutation({
    onSuccess: () => { toast.success(t('common.delete')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('providers.statuses.ACTIVE'),
    INACTIVE: t('providers.statuses.INACTIVE'),
    PENDING_APPROVAL: t('providers.statuses.PENDING_APPROVAL'),
    TERMINATED: t('providers.statuses.TERMINATED'),
  };

  const tariffs = (provider.tariffs ?? []) as { id: string; serviceName: string; amount: number; currency: string }[];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/providers" className="text-text-3 hover:text-text-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan/10">
          <Stethoscope className="h-4 w-4 text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-1">{provider.firstName} {provider.lastName}</h1>
          <p className="text-small text-text-3">{t(`providers.specialties.${provider.specialty}`)}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[provider.status] ?? 'secondary'}>{STATUS_LABELS[provider.status] ?? provider.status}</Badge>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-small">
          <div>
            <p className="text-text-3 text-tiny mb-0.5">{t('providers.email')}</p>
            <p className="text-text-1">{provider.email}</p>
          </div>
          <div>
            <p className="text-text-3 text-tiny mb-0.5">{t('providers.phone')}</p>
            <p className="text-text-1">{provider.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-text-3 text-tiny mb-0.5">{t('providers.licenseNumber')}</p>
            <p className="font-mono text-text-1">{provider.licenseNumber ?? '—'}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          {provider.status === 'ACTIVE' ? (
            <Button variant="outline" size="sm" onClick={() => update.mutate({ id: provider.id, status: 'INACTIVE' })}>
              {t('common.inactive')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => update.mutate({ id: provider.id, status: 'ACTIVE' })}>
              {t('common.active')}
            </Button>
          )}
        </div>
      </div>

      {/* Tariffs */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-small font-semibold text-text-1">{t('providers.tariffs')}</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddTariff(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('providers.addTariff')}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('providers.serviceName')}</TableHead>
              <TableHead>{t('providers.tariffAmount')}</TableHead>
              <TableHead>{t('providers.tariffCurrency')}</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tariffs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-text-3">{t('common.noData')}</TableCell></TableRow>
            ) : (
              tariffs.map((tariff) => (
                <TableRow key={tariff.id}>
                  <TableCell className="text-small text-text-1">{tariff.serviceName}</TableCell>
                  <TableCell className="font-mono text-small text-text-1">{Number(tariff.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-small text-text-2">{tariff.currency}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => removeTariff.mutate({ id: tariff.id })}
                      className="p-1 text-text-muted hover:text-rose transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showAddTariff && (
        <AddTariffDialog
          providerId={provider.id}
          onClose={() => setShowAddTariff(false)}
          onAdded={() => { setShowAddTariff(false); void refetch(); }}
        />
      )}
    </div>
  );
}

function AddTariffDialog({ providerId, onClose, onAdded }: { providerId: string; onClose: () => void; onAdded: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ serviceName: '', amount: '', currency: 'USD' as typeof CURRENCIES[number] });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const add = trpc.providers.addTariff.useMutation({
    onSuccess: () => { toast.success(t('providers.updated')); onAdded(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('providers.addTariff')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('providers.serviceName')} *</Label>
            <Input value={form.serviceName} onChange={(e) => f('serviceName', e.target.value)} placeholder="Ej: Radiografía lumbar" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('providers.tariffAmount')} *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => f('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('providers.tariffCurrency')} *</Label>
              <Select value={form.currency} onValueChange={(v) => f('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={add.isPending}
            disabled={!form.serviceName || !form.amount}
            onClick={() => add.mutate({ providerId, serviceName: form.serviceName, amount: Number(form.amount), currency: form.currency })}
          >
            {t('providers.addTariff')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
