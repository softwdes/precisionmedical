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
import { Plus, BadgeDollarSign, CheckCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type CommissionList = inferRouterOutputs<AppRouter>['commissions']['list'];
type Lawyer = inferRouterOutputs<AppRouter>['lawyers']['list']['items'][number];
type Provider = inferRouterOutputs<AppRouter>['providers']['list']['items'][number];
type Patient = inferRouterOutputs<AppRouter>['patients']['list']['items'][number];

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  EARNED: 'info',
  APPROVED: 'warning',
  PAID: 'success',
  CANCELLED: 'secondary',
  REVERSED: 'destructive',
};

const STATUSES = ['EARNED', 'APPROVED', 'PAID', 'CANCELLED', 'REVERSED'] as const;
const CURRENCIES = ['USD', 'BOB', 'PEN'] as const;

export function CommissionsClient({
  initial, lawyers, providers, patients,
}: {
  initial: CommissionList;
  lawyers: Lawyer[];
  providers: Provider[];
  patients: Patient[];
}): React.ReactElement {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [payTarget, setPayTarget] = useState<string | null>(null);

  const { data, refetch } = trpc.commissions.list.useQuery(
    { page, status: statusFilter as typeof STATUSES[number] | undefined },
    { initialData: initial },
  );

  const approve = trpc.commissions.approve.useMutation({
    onSuccess: () => { toast.success(t('commissions.approved')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reverse = trpc.commissions.reverse.useMutation({
    onSuccess: () => { toast.success(t('commissions.reversed')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const STATUS_LABELS: Record<string, string> = Object.fromEntries(
    STATUSES.map(s => [s, t(`commissions.statuses.${s}`)]),
  );

  const totalEarned = (data?.items ?? [])
    .filter(c => c.status === 'EARNED' || c.status === 'APPROVED')
    .reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('commissions.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('commissions.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('commissions.addNew')}
        </Button>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center gap-3">
        <BadgeDollarSign className="h-4 w-4 text-text-3 shrink-0" />
        <p className="text-small text-text-2">
          {t('commissions.statuses.EARNED')} + {t('commissions.statuses.APPROVED')}:{' '}
          <span className="font-mono font-semibold text-text-1">${totalEarned.toLocaleString()}</span>
        </p>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.status')}</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Mobile */}
        <div className="md:hidden divide-y divide-border">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('commissions.noCommissions')}</div>
          ) : (
            (data?.items ?? []).map((comm) => {
              const patient = comm.patient as unknown as { patientCode: string; firstName: string; lastName: string } | null;
              const lawyer = comm.lawyer as unknown as { firstName?: string; lastName?: string; firmName?: string } | null;
              const provider = comm.provider as unknown as { firstName: string; lastName: string } | null;
              const recipientName = lawyer
                ? (lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim())
                : provider ? `${provider.firstName} ${provider.lastName}` : '—';
              return (
                <div key={comm.id} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-text-1">${Number(comm.amount).toFixed(2)} {comm.currency}</p>
                      <p className="text-tiny text-text-3 truncate">{patient?.firstName} {patient?.lastName} · {recipientName}</p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[comm.status] ?? 'secondary'}>{STATUS_LABELS[comm.status] ?? comm.status}</Badge>
                  </div>
                  <div className="flex gap-2">
                    {comm.status === 'EARNED' && (
                      <Button variant="outline" size="sm" onClick={() => approve.mutate({ id: comm.id })}>
                        <CheckCircle className="h-3 w-3" />
                        {t('commissions.approve')}
                      </Button>
                    )}
                    {comm.status === 'APPROVED' && (
                      <Button variant="outline" size="sm" onClick={() => setPayTarget(comm.id)}>
                        {t('commissions.markPaid')}
                      </Button>
                    )}
                    {(comm.status === 'EARNED' || comm.status === 'APPROVED') && (
                      <Button variant="outline" size="sm" onClick={() => reverse.mutate({ id: comm.id })}>
                        <RotateCcw className="h-3 w-3" />
                        {t('commissions.reverse')}
                      </Button>
                    )}
                  </div>
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
                <TableHead>{t('commissions.patient')}</TableHead>
                <TableHead>{t('commissions.lawyer')} / {t('commissions.provider')}</TableHead>
                <TableHead>{t('commissions.amount')}</TableHead>
                <TableHead>{t('commissions.earnedAt')}</TableHead>
                <TableHead>{t('commissions.status')}</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('commissions.noCommissions')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((comm) => {
                  const patient = comm.patient as unknown as { patientCode: string; firstName: string; lastName: string } | null;
                  const lawyer = comm.lawyer as unknown as { firstName?: string; lastName?: string; firmName?: string } | null;
                  const provider = comm.provider as unknown as { firstName: string; lastName: string } | null;
                  const recipientName = lawyer
                    ? (lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim())
                    : provider ? `${provider.firstName} ${provider.lastName}` : '—';
                  return (
                    <TableRow key={comm.id}>
                      <TableCell>
                        <p className="text-small font-medium text-text-1">{patient?.firstName} {patient?.lastName}</p>
                        <p className="text-tiny font-mono text-text-muted">{patient?.patientCode}</p>
                      </TableCell>
                      <TableCell className="text-small text-text-2">{recipientName}</TableCell>
                      <TableCell className="font-mono font-semibold text-text-1">${Number(comm.amount).toFixed(2)} <span className="text-tiny text-text-3">{comm.currency}</span></TableCell>
                      <TableCell className="text-small text-text-2">{new Date(comm.earnedAt as string).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANTS[comm.status] ?? 'secondary'}>{STATUS_LABELS[comm.status] ?? comm.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {comm.status === 'EARNED' && (
                            <Button variant="outline" size="sm" onClick={() => approve.mutate({ id: comm.id })}>
                              {t('commissions.approve')}
                            </Button>
                          )}
                          {comm.status === 'APPROVED' && (
                            <Button variant="outline" size="sm" onClick={() => setPayTarget(comm.id)}>
                              {t('commissions.markPaid')}
                            </Button>
                          )}
                          {(comm.status === 'EARNED' || comm.status === 'APPROVED') && (
                            <button onClick={() => reverse.mutate({ id: comm.id })} className="p-1 text-text-muted hover:text-rose transition-colors" title={t('commissions.reverse')}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
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

      <CreateCommissionDialog
        open={showCreate}
        lawyers={lawyers}
        providers={providers}
        patients={patients}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />

      {payTarget && (
        <MarkPaidDialog
          commissionId={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => { setPayTarget(null); void refetch(); }}
        />
      )}
    </div>
  );
}

function CreateCommissionDialog({
  open, lawyers, providers, patients, onClose, onCreated,
}: {
  open: boolean;
  lawyers: Lawyer[];
  providers: Provider[];
  patients: Patient[];
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [recipientType, setRecipientType] = useState<'lawyer' | 'provider'>('lawyer');
  const [form, setForm] = useState({
    lawyerId: '',
    providerId: '',
    patientId: '',
    amount: '',
    currency: 'USD' as typeof CURRENCIES[number],
    notes: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.commissions.create.useMutation({
    onSuccess: () => { toast.success(t('commissions.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-sm overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{t('commissions.createCommission')}</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
          <div className="flex gap-2">
            <Button
              variant={recipientType === 'lawyer' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRecipientType('lawyer')}
            >
              {t('commissions.lawyer')}
            </Button>
            <Button
              variant={recipientType === 'provider' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRecipientType('provider')}
            >
              {t('commissions.provider')}
            </Button>
          </div>
          {recipientType === 'lawyer' ? (
            <div className="space-y-1.5">
              <Label>{t('commissions.lawyer')} *</Label>
              <Select value={form.lawyerId} onValueChange={(v) => f('lawyerId', v)}>
                <SelectTrigger><SelectValue placeholder={t('commissions.lawyer')} /></SelectTrigger>
                <SelectContent>
                  {lawyers.map(l => {
                    const name = l.entityType === 'FIRM' ? (l.firmName ?? l.email) : `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim();
                    return <SelectItem key={l.id} value={l.id}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('commissions.provider')} *</Label>
              <Select value={form.providerId} onValueChange={(v) => f('providerId', v)}>
                <SelectTrigger><SelectValue placeholder={t('commissions.provider')} /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('commissions.patient')} *</Label>
            <Select value={form.patientId} onValueChange={(v) => f('patientId', v)}>
              <SelectTrigger><SelectValue placeholder={t('commissions.patient')} /></SelectTrigger>
              <SelectContent>
                {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('commissions.amount')} *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => f('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('commissions.currency')}</Label>
              <Select value={form.currency} onValueChange={(v) => f('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('commissions.notes')}</Label>
            <Input value={form.notes} onChange={(e) => f('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.patientId || !form.amount || (recipientType === 'lawyer' ? !form.lawyerId : !form.providerId)}
            onClick={() => create.mutate({
              lawyerId: recipientType === 'lawyer' ? form.lawyerId : undefined,
              providerId: recipientType === 'provider' ? form.providerId : undefined,
              patientId: form.patientId,
              amount: Number(form.amount),
              currency: form.currency,
              notes: form.notes || undefined,
            })}
          >
            {t('commissions.createCommission')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ commissionId, onClose, onPaid }: { commissionId: string; onClose: () => void; onPaid: () => void }): React.ReactElement {
  const t = useTranslations();
  const [proofUrl, setProofUrl] = useState('');

  const markPaid = trpc.commissions.markPaid.useMutation({
    onSuccess: () => { toast.success(t('commissions.paid')); onPaid(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-sm overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{t('commissions.markPaid')}</DialogTitle></DialogHeader>
        <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
          <Label>{t('commissions.paidProofUrl')}</Label>
          <Input type="url" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://..." />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={markPaid.isPending}
            onClick={() => markPaid.mutate({ id: commissionId, paidProofUrl: proofUrl || undefined })}
          >
            {t('commissions.markPaid')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
