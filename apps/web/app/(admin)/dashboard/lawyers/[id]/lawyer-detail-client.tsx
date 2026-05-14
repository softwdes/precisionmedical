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
} from '@precision/ui';
import { ArrowLeft, Scale, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Lawyer = inferRouterOutputs<AppRouter>['lawyers']['getById'];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  INACTIVE: 'secondary',
  TERMINATED: 'destructive',
};

export function LawyerDetailClient({ lawyer: initial }: { lawyer: Lawyer }): React.ReactElement {
  const t = useTranslations();
  const [showConfig, setShowConfig] = useState(false);

  const { data: lawyer, refetch } = trpc.lawyers.getById.useQuery({ id: initial.id }, { initialData: initial });

  const update = trpc.lawyers.update.useMutation({
    onSuccess: () => { toast.success(t('lawyers.updated')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const name = lawyer.entityType === 'FIRM'
    ? (lawyer.firmName ?? '—')
    : [lawyer.firstName, lawyer.lastName].filter(Boolean).join(' ') || '—';

  type CommConfig = { scheme: string; flatAmount?: number | null; percentage?: number | null; effectiveFrom: string; effectiveTo?: string | null };
  const commissionConfig = (lawyer.commissionConfig as unknown as CommConfig[] | null)?.[0] ?? null;

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

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/lawyers" className="text-text-3 hover:text-text-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10">
          <Scale className="h-4 w-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-1 truncate">{name}</h1>
          <p className="text-small text-text-3">{ENTITY_LABELS[lawyer.entityType] ?? lawyer.entityType}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[lawyer.status] ?? 'secondary'}>{STATUS_LABELS[lawyer.status] ?? lawyer.status}</Badge>
      </div>

      {/* Info card */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
        <h2 className="text-small font-semibold text-text-1 uppercase tracking-wide">{t('common.actions')}</h2>
        <div className="grid grid-cols-2 gap-4 text-small">
          <div>
            <p className="text-text-3 text-tiny mb-0.5">{t('lawyers.email')}</p>
            <p className="text-text-1">{lawyer.email}</p>
          </div>
          <div>
            <p className="text-text-3 text-tiny mb-0.5">{t('lawyers.phone')}</p>
            <p className="text-text-1">{lawyer.phone ?? '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-text-3 text-tiny mb-0.5">{t('lawyers.address')}</p>
            <p className="text-text-1">{lawyer.address ?? '—'}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          {lawyer.status === 'ACTIVE' ? (
            <Button variant="outline" size="sm" onClick={() => update.mutate({ id: lawyer.id, status: 'INACTIVE' })}>
              {t('common.inactive')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => update.mutate({ id: lawyer.id, status: 'ACTIVE' })}>
              {t('common.active')}
            </Button>
          )}
        </div>
      </div>

      {/* Commission config */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-small font-semibold text-text-1">{t('lawyers.commissionConfig')}</h2>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
        </div>
        {commissionConfig ? (
          <div className="grid grid-cols-2 gap-3 text-small">
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('lawyers.scheme')}</p>
              <p className="text-text-1 font-medium">{t(`lawyers.schemes.${commissionConfig.scheme}`)}</p>
            </div>
            {commissionConfig.flatAmount && (
              <div>
                <p className="text-tiny text-text-3 mb-0.5">{t('lawyers.flatAmount')}</p>
                <p className="font-mono text-text-1">${Number(commissionConfig.flatAmount).toFixed(2)}</p>
              </div>
            )}
            {commissionConfig.percentage && (
              <div>
                <p className="text-tiny text-text-3 mb-0.5">{t('lawyers.percentage')}</p>
                <p className="font-mono text-text-1">{Number(commissionConfig.percentage).toFixed(2)}%</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-small text-text-3">{t('common.noData')}</p>
        )}
      </div>

      {showConfig && (
        <CommissionConfigDialog
          lawyer={lawyer}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); void refetch(); }}
        />
      )}
    </div>
  );
}

function CommissionConfigDialog({ lawyer, onClose, onSaved }: { lawyer: Lawyer; onClose: () => void; onSaved: () => void }): React.ReactElement {
  const t = useTranslations();
  type ExistingConfig = { scheme: string; flatAmount?: number; percentage?: number; effectiveFrom: string; effectiveTo?: string };
  const existing = ((lawyer.commissionConfig as unknown as ExistingConfig[] | null)?.[0]) ?? null;
  const [form, setForm] = useState({
    scheme: existing?.scheme ?? 'FLAT_PER_REFERRAL',
    flatAmount: existing?.flatAmount ? String(existing.flatAmount) : '',
    percentage: existing?.percentage ? String(existing.percentage) : '',
    effectiveFrom: existing?.effectiveFrom ? existing.effectiveFrom.split('T')[0] : new Date().toISOString().split('T')[0],
    effectiveTo: existing?.effectiveTo ? existing.effectiveTo.split('T')[0] : '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const save = trpc.lawyers.saveCommissionConfig.useMutation({
    onSuccess: () => { toast.success(t('lawyers.configSaved')); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('lawyers.commissionConfig')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('lawyers.scheme')} *</Label>
            <Select value={form.scheme} onValueChange={(v) => f('scheme', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['FLAT_PER_REFERRAL', 'PERCENTAGE_OF_BILLING', 'VOLUME_TIER', 'HYBRID'] as const).map(s => (
                  <SelectItem key={s} value={s}>{t(`lawyers.schemes.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(form.scheme === 'FLAT_PER_REFERRAL' || form.scheme === 'HYBRID') && (
            <div className="space-y-1.5">
              <Label>{t('lawyers.flatAmount')}</Label>
              <Input type="number" min="0" step="0.01" value={form.flatAmount} onChange={(e) => f('flatAmount', e.target.value)} />
            </div>
          )}
          {(form.scheme === 'PERCENTAGE_OF_BILLING' || form.scheme === 'HYBRID') && (
            <div className="space-y-1.5">
              <Label>{t('lawyers.percentage')}</Label>
              <Input type="number" min="0" max="100" step="0.01" value={form.percentage} onChange={(e) => f('percentage', e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('lawyers.effectiveFrom')} *</Label>
              <Input type="date" value={form.effectiveFrom} onChange={(e) => f('effectiveFrom', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('lawyers.effectiveTo')}</Label>
              <Input type="date" value={form.effectiveTo} onChange={(e) => f('effectiveTo', e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={save.isPending}
            disabled={!form.effectiveFrom}
            onClick={() => save.mutate({
              lawyerId: lawyer.id,
              scheme: form.scheme as 'FLAT_PER_REFERRAL' | 'PERCENTAGE_OF_BILLING' | 'VOLUME_TIER' | 'HYBRID',
              flatAmount: form.flatAmount ? Number(form.flatAmount) : undefined,
              percentage: form.percentage ? Number(form.percentage) : undefined,
              effectiveFrom: form.effectiveFrom,
              effectiveTo: form.effectiveTo || undefined,
            })}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
