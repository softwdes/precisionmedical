'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Card, CardContent,
} from '@precision-medical/ui';
import { Plus, CheckCircle, RotateCcw, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type PaymentsListOutput = inferRouterOutputs<AppRouter>['payments']['list'];
type PaymentsSummary = inferRouterOutputs<AppRouter>['payments']['getSummary'];

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  PAID: 'success', PENDING: 'warning', CANCELLED: 'destructive', REVERSED: 'secondary', SCHEDULED: 'info', PARTIAL: 'warning',
};

export function PaymentsClient({ initial, summary }: { initial: PaymentsListOutput; summary: PaymentsSummary }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState<string | null>(null);
  const [showReverse, setShowReverse] = useState<string | null>(null);

  const STATUS_LABELS = {
    PAID: t('payments.statuses.PAID'),
    PENDING: t('payments.statuses.PENDING'),
    CANCELLED: t('payments.statuses.CANCELLED'),
    REVERSED: t('payments.statuses.REVERSED'),
    SCHEDULED: t('payments.statuses.SCHEDULED'),
    PARTIAL: t('payments.statuses.PARTIAL'),
  };

  const { data, refetch } = trpc.payments.list.useQuery(
    { page, pageSize: 25, status: (statusFilter as 'PENDING' | 'SCHEDULED' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'REVERSED' | undefined) || undefined },
    { initialData: initial },
  );

  const markPaid = trpc.payments.markAsPaid.useMutation({
    onSuccess: () => { toast.success(t('payments.markedAsPaid')); setShowMarkPaid(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reverse = trpc.payments.reverse.useMutation({
    onSuccess: () => { toast.success(t('payments.reversed')); setShowReverse(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [reverseReason, setReverseReason] = useState('');

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('payments.title')}</h1>
          <p className="text-small text-text-3">{t('payments.periodLabel')}: {summary.period}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('payments.newPayment')}
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10"><CheckCircle className="h-4 w-4 text-emerald" /></div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">{t('payments.paidThisMonth')}</p>
                <p className="text-lg font-bold text-text-1">${summary.totalPaid.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber/10"><Clock className="h-4 w-4 text-amber" /></div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">{t('payments.statuses.PENDING')}</p>
                <p className="text-lg font-bold text-text-1">${summary.totalPending.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10"><TrendingUp className="h-4 w-4 text-brand" /></div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">{t('payments.totalPayments')}</p>
                <p className="text-lg font-bold text-text-1">{summary.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('payments.all')}</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table / Cards */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile: card list */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('payments.noPayments')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((payment) => {
                const emp = (payment.employee as unknown) as { firstName: string; lastName: string; employeeCode: string } | null;
                return (
                  <div key={payment.id} className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-small font-bold text-brand shrink-0">
                          {emp ? `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}` : '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-text-1 truncate">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</p>
                          <p className="text-tiny text-text-muted font-mono">{emp?.employeeCode} · {payment.period}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono font-bold text-base leading-tight ${Number(payment.amountLocal) < 0 ? 'text-rose' : 'text-text-1'}`}>
                          ${Math.abs(Number(payment.amountLocal)).toLocaleString()}
                        </p>
                        <p className="text-tiny text-text-muted">{payment.currencyLocal}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_COLORS[payment.status] ?? 'secondary'}>{STATUS_LABELS[payment.status as keyof typeof STATUS_LABELS] ?? payment.status}</Badge>
                        <span className="text-tiny text-text-muted">
                          {new Date(payment.scheduledDate).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {payment.status === 'PENDING' && (
                          <button
                            onClick={() => setShowMarkPaid(payment.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-emerald/10 text-text-muted hover:text-emerald transition-colors"
                            title={t('payments.markAsPaid')}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {payment.status === 'PAID' && !payment.reversedById && (
                          <button
                            onClick={() => setShowReverse(payment.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-amber/10 text-text-muted hover:text-amber transition-colors"
                            title={t('payments.reversePayment')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('employees.employee')}</TableHead>
                <TableHead>{t('payments.periodLabel')}</TableHead>
                <TableHead>{t('common.amount')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('payments.scheduledDate')}</TableHead>
                <TableHead className="w-20">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('payments.noPayments')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((payment) => {
                  const emp = (payment.employee as unknown) as { firstName: string; lastName: string; employeeCode: string } | null;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-text-1">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</p>
                          <p className="text-tiny text-text-3 font-mono">{emp?.employeeCode}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-small text-text-2">{payment.period}</TableCell>
                      <TableCell className={`font-mono font-semibold ${Number(payment.amountLocal) < 0 ? 'text-rose' : 'text-text-1'}`}>
                        ${Math.abs(Number(payment.amountLocal)).toLocaleString()} {payment.currencyLocal}
                      </TableCell>
                      <TableCell><Badge variant={STATUS_COLORS[payment.status] ?? 'secondary'}>{STATUS_LABELS[payment.status as keyof typeof STATUS_LABELS] ?? payment.status}</Badge></TableCell>
                      <TableCell className="text-small text-text-3">{new Date(payment.scheduledDate).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {payment.status === 'PENDING' && (
                            <button onClick={() => setShowMarkPaid(payment.id)} className="p-1 text-text-muted hover:text-emerald transition-colors" title={t('payments.markAsPaid')}>
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {payment.status === 'PAID' && !payment.reversedById && (
                            <button onClick={() => setShowReverse(payment.id)} className="p-1 text-text-muted hover:text-amber transition-colors" title={t('payments.reversePayment')}>
                              <RotateCcw className="h-4 w-4" />
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

      {/* Pagination */}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreatePaymentDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refetch(); }} />

      {/* Mark Paid Dialog */}
      <Dialog open={!!showMarkPaid} onOpenChange={(o) => { if (!o) setShowMarkPaid(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('payments.markAsPaid')}</DialogTitle></DialogHeader>
          <p className="text-small text-text-3">{t('payments.markAsPaidConfirm')}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowMarkPaid(null)}>{t('common.cancel')}</Button>
            <Button loading={markPaid.isPending} onClick={() => showMarkPaid && markPaid.mutate({ id: showMarkPaid })}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse Dialog */}
      <Dialog open={!!showReverse} onOpenChange={(o) => { if (!o) setShowReverse(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('payments.reversePayment')}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>{t('payments.reverseReason')} *</Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder={t('payments.reverseReasonPlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReverse(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" loading={reverse.isPending} disabled={!reverseReason.trim()} onClick={() => showReverse && reverse.mutate({ id: showReverse, reason: reverseReason })}>
              {t('payments.reverseButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreatePaymentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ employeeId: '', period: new Date().toISOString().slice(0, 7), amountLocal: '', currencyLocal: 'USD' as const, scheduledDate: '', notes: '' });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const { data: employees } = trpc.employees.list.useQuery({ page: 1, pageSize: 100, status: 'ACTIVE' });

  const create = trpc.payments.create.useMutation({
    onSuccess: () => { toast.success(t('payments.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    create.mutate({ ...form, amountLocal: Number(form.amountLocal), scheduledDate: new Date(form.scheduledDate), notes: form.notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('payments.newPayment')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('employees.employee')} *</Label>
            <Select value={form.employeeId} onValueChange={(v) => f('employeeId', v)}>
              <SelectTrigger><SelectValue placeholder={t('payments.employeePlaceholder')} /></SelectTrigger>
              <SelectContent>
                {(employees?.items ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} — {e.employeeCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('payments.periodLabel')} *</Label><Input type="month" required value={form.period} onChange={(e) => f('period', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('payments.scheduledDateLabel')} *</Label><Input type="date" required value={form.scheduledDate} onChange={(e) => f('scheduledDate', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('payments.amountLabel')} *</Label><Input type="number" required min="0.01" step="0.01" value={form.amountLocal} onChange={(e) => f('amountLocal', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t('finance.currency')}</Label>
              <Select value={form.currencyLocal} onValueChange={(v) => f('currencyLocal', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BOB">BOB</SelectItem>
                  <SelectItem value="PEN">PEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>{t('payments.notesLabel')}</Label><Textarea value={form.notes} onChange={(e) => f('notes', e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('payments.createButton')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
