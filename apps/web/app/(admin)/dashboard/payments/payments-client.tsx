'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Card, CardContent,
} from '@precision/ui';
import { Plus, CheckCircle, RotateCcw, Clock, TrendingUp, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type PaymentsListOutput = inferRouterOutputs<AppRouter>['payments']['list'];
type PaymentsSummary   = inferRouterOutputs<AppRouter>['payments']['getSummary'];
type PaymentItem       = PaymentsListOutput['items'][number];

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  PAID: 'success', PENDING: 'warning', CANCELLED: 'destructive',
  REVERSED: 'secondary', SCHEDULED: 'info', PARTIAL: 'warning',
};

// ─── Helpers ────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPeriod(period: string, locale: string): string {
  const [y, m] = period.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Bonus Toggle ────────────────────────────────────────────

function BonusToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200 cursor-pointer border-0"
      style={{
        background: checked ? '#10B981' : 'rgba(51,65,85,0.8)',
        boxShadow: checked ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
        minWidth: '44px',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)' }}
      />
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────

export function PaymentsClient({ initial, summary }: { initial: PaymentsListOutput; summary: PaymentsSummary }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState<string | null>(null);
  const [showReverse, setShowReverse] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

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

  const items = (data?.items ?? []) as PaymentItem[];

  const markPaid = trpc.payments.markAsPaid.useMutation({
    onSuccess: () => { toast.success(t('payments.markedAsPaid')); setShowMarkPaid(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reverse = trpc.payments.reverse.useMutation({
    onSuccess: () => { toast.success(t('payments.reversed')); setShowReverse(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Summary bar — computed from visible page items
  const summaryBar = useMemo(() => {
    const visible = items.filter(p => Number(p.amountLocal) > 0);
    const totalPayroll = visible.reduce((s, p) => s + Number(p.amountLocal), 0);
    const totalBonuses = visible.reduce((s, p) => s + Math.abs(Number(p.bonus_amount) || 0), 0);
    const currency = visible[0]?.currencyLocal ?? 'USD';
    return { totalPayroll, totalBonuses, currency };
  }, [items]);

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">

      {/* Header */}
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

      {/* KPI cards */}
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

      {/* Filter */}
      <div className="flex gap-2">
        <div className="w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40 min-h-[38px]"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('payments.all')}</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List / Table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* ── Mobile: card list (< md) ── */}
        <div className="md:hidden">
          {items.length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('payments.noPayments')}</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((payment) => {
                const emp = (payment.employee as unknown) as { firstName: string; lastName: string; employeeCode: string } | null;
                const total = Math.abs(Number(payment.amountLocal));
                const base  = Number(payment.base_salary) || total;
                const bonus = Math.abs(Number(payment.bonus_amount) || 0);
                return (
                  <div
                    key={payment.id}
                    className="px-4 py-3.5 transition-colors"
                    style={{ cursor: 'default' }}
                  >
                    {/* Row 1: Avatar + Name + Status badge */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                          {emp ? `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}` : '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-1 truncate">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</p>
                          <p className="text-[11px] text-text-muted font-mono">{emp?.employeeCode}</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_COLORS[payment.status] ?? 'secondary'} className="text-[10px] shrink-0">
                        {STATUS_LABELS[payment.status as keyof typeof STATUS_LABELS] ?? payment.status}
                      </Badge>
                    </div>

                    {/* Row 2: Period + Total amount */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-3">{fmtPeriod(payment.period, locale)}</span>
                      <span className={`font-mono font-bold text-base ${Number(payment.amountLocal) < 0 ? 'text-rose' : 'text-text-1'}`}>
                        {Number(payment.amountLocal) < 0 ? '-' : ''}{fmtCurrency(total)}
                      </span>
                    </div>

                    {/* Row 3: Base salary + action buttons */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-muted">
                        {t('payments.baseSalary')}: {fmtCurrency(base)}
                      </span>
                      <div className="flex gap-1">
                        {payment.status === 'PENDING' && (
                          <button
                            onClick={() => setShowMarkPaid(payment.id)}
                            className="flex h-8 w-8 min-w-[44px] items-center justify-center rounded-lg hover:bg-emerald/10 text-text-muted hover:text-emerald transition-colors"
                            title={t('payments.markAsPaid')}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {payment.status === 'PAID' && !payment.reversedById && (
                          <button
                            onClick={() => setShowReverse(payment.id)}
                            className="flex h-8 w-8 min-w-[44px] items-center justify-center rounded-lg hover:bg-amber/10 text-text-muted hover:text-amber transition-colors"
                            title={t('payments.reversePayment')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 4: Bonus line (only if bonus exists) */}
                    {bonus > 0 && (
                      <p className="text-[12px] mt-1.5 font-medium" style={{ color: '#10B981' }}>
                        {t('payments.bonusLabel')}: +{fmtCurrency(bonus)}
                        {payment.bonus_reason ? ` · ${payment.bonus_reason}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Desktop: full table (≥ md) ── */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ minWidth: 180 }}>{t('employees.employee')}</TableHead>
                <TableHead style={{ minWidth: 110 }}>{t('payments.periodLabel')}</TableHead>
                <TableHead className="text-right" style={{ minWidth: 120 }}>{t('payments.baseSalary')}</TableHead>
                <TableHead className="text-right" style={{ minWidth: 110 }}>{t('payments.bonusLabel')}</TableHead>
                <TableHead className="text-right" style={{ minWidth: 120 }}>{t('common.total')}</TableHead>
                <TableHead style={{ minWidth: 75 }}>{t('finance.currency')}</TableHead>
                <TableHead style={{ minWidth: 95 }}>{t('common.status')}</TableHead>
                <TableHead className="w-16">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-text-3">{t('payments.noPayments')}</TableCell>
                </TableRow>
              ) : (
                items.map((payment) => {
                  const emp   = (payment.employee as unknown) as { firstName: string; lastName: string; employeeCode: string } | null;
                  const total = Number(payment.amountLocal);
                  const base  = Number(payment.base_salary) || Math.abs(total);
                  const bonus = Math.abs(Number(payment.bonus_amount) || 0);
                  return (
                    <TableRow key={payment.id}>

                      {/* Empleado */}
                      <TableCell style={{ minWidth: 180 }}>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                            {emp ? `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}` : '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-1">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</p>
                            <p className="text-[10px] text-text-muted font-mono">{emp?.employeeCode}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Período */}
                      <TableCell style={{ minWidth: 110 }}>
                        <span className="text-small text-text-2">{fmtPeriod(payment.period, locale)}</span>
                      </TableCell>

                      {/* Salario base */}
                      <TableCell className="text-right" style={{ minWidth: 120 }}>
                        <span className="font-mono text-small text-text-2">
                          {total < 0 ? '-' : ''}{fmtCurrency(base)}
                        </span>
                      </TableCell>

                      {/* Bono */}
                      <TableCell className="text-right" style={{ minWidth: 110 }}>
                        {bonus > 0 ? (
                          <span
                            title={payment.bonus_reason ?? ''}
                            style={{
                              display: 'inline-block',
                              background: 'rgba(16,185,129,0.10)',
                              color: '#10B981',
                              border: '1px solid rgba(16,185,129,0.25)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '10px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              cursor: 'default',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            +{fmtCurrency(bonus)}
                          </span>
                        ) : (
                          <span className="text-text-muted text-small">—</span>
                        )}
                      </TableCell>

                      {/* Total */}
                      <TableCell className="text-right" style={{ minWidth: 120 }}>
                        <span className={`font-mono font-bold text-small ${total < 0 ? 'text-rose' : 'text-text-1'}`}>
                          {total < 0 ? '-' : ''}{fmtCurrency(Math.abs(total))}
                        </span>
                      </TableCell>

                      {/* Moneda */}
                      <TableCell style={{ minWidth: 75 }}>
                        <Badge variant="secondary" className="text-[10px] font-mono">{payment.currencyLocal}</Badge>
                      </TableCell>

                      {/* Estado */}
                      <TableCell style={{ minWidth: 95 }}>
                        <Badge variant={STATUS_COLORS[payment.status] ?? 'secondary'}>
                          {STATUS_LABELS[payment.status as keyof typeof STATUS_LABELS] ?? payment.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex gap-1">
                          {payment.status === 'PENDING' && (
                            <button
                              onClick={() => setShowMarkPaid(payment.id)}
                              className="p-1.5 text-text-muted hover:text-emerald transition-colors rounded"
                              title={t('payments.markAsPaid')}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {payment.status === 'PAID' && !payment.reversedById && (
                            <button
                              onClick={() => setShowReverse(payment.id)}
                              className="p-1.5 text-text-muted hover:text-amber transition-colors rounded"
                              title={t('payments.reversePayment')}
                            >
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

        {/* ── Summary bar ── */}
        {items.length > 0 && (
          <div className="border-t border-border flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3">
            {summaryBar.totalBonuses > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-text-muted uppercase tracking-wide">{t('payments.summaryBonuses')}:</span>
                <span className="text-[11px] font-mono font-bold" style={{ color: '#10B981' }}>
                  {fmtCurrency(summaryBar.totalBonuses)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted uppercase tracking-wide">{t('payments.summaryPayroll')}:</span>
              <span className="text-[11px] font-mono font-bold text-text-1">
                {fmtCurrency(summaryBar.totalPayroll)} {summaryBar.currency}
              </span>
            </div>
          </div>
        )}
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

      {/* Dialogs */}
      <CreatePaymentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />

      <Dialog open={!!showMarkPaid} onOpenChange={(o) => { if (!o) setShowMarkPaid(null); }}>
        <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-sm overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle>{t('payments.markAsPaid')}</DialogTitle></DialogHeader>
          <p className="text-small text-text-3 flex-1 py-2">{t('payments.markAsPaidConfirm')}</p>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setShowMarkPaid(null)}>{t('common.cancel')}</Button>
            <Button loading={markPaid.isPending} onClick={() => showMarkPaid && markPaid.mutate({ id: showMarkPaid })}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showReverse} onOpenChange={(o) => { if (!o) setShowReverse(null); }}>
        <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-sm overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle>{t('payments.reversePayment')}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <Label>{t('payments.reverseReason')} *</Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder={t('payments.reverseReasonPlaceholder')} />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setShowReverse(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" loading={reverse.isPending} disabled={!reverseReason.trim()}
              onClick={() => showReverse && reverse.mutate({ id: showReverse, reason: reverseReason })}
            >
              {t('payments.reverseButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Create Payment Dialog ──────────────────────────────────

function CreatePaymentDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const t = useTranslations();

  const [form, setForm] = useState({
    employeeId:   '',
    period:       new Date().toISOString().slice(0, 7),
    scheduledDate: '',
    baseSalary:   '',
    currencyLocal: 'USD' as 'USD' | 'BOB' | 'PEN',
    notes:        '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonusAmount,  setBonusAmount]  = useState('');
  const [bonusReason,  setBonusReason]  = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = (): void => {
    setForm({ employeeId: '', period: new Date().toISOString().slice(0, 7), scheduledDate: '', baseSalary: '', currencyLocal: 'USD', notes: '' });
    setBonusEnabled(false);
    setBonusAmount('');
    setBonusReason('');
    setErrors({});
  };

  const { data: employees } = trpc.employees.list.useQuery({ page: 1, pageSize: 100, status: 'ACTIVE' });

  const create = trpc.payments.create.useMutation({
    onSuccess: () => { toast.success(t('payments.created')); resetForm(); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  // Real-time total
  const baseSalaryNum  = parseFloat(form.baseSalary) || 0;
  const bonusAmountNum = bonusEnabled ? (parseFloat(bonusAmount) || 0) : 0;
  const totalAmount    = baseSalaryNum + bonusAmountNum;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.employeeId)                              errs.employeeId   = t('common.required');
    if (!form.scheduledDate)                           errs.scheduledDate = t('common.required');
    if (!form.baseSalary || Number(form.baseSalary) <= 0) errs.baseSalary = t('payments.errAmountPositive');
    if (bonusEnabled) {
      if (!bonusAmount || Number(bonusAmount) <= 0)    errs.bonusAmount  = t('payments.errAmountPositive');
      if (!bonusReason || bonusReason.trim().length < 3) errs.bonusReason = t('payments.errReasonMin');
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    create.mutate({
      employeeId:   form.employeeId,
      period:       form.period,
      baseSalary:   Number(form.baseSalary),
      bonusAmount:  bonusEnabled ? Number(bonusAmount) : undefined,
      bonusReason:  bonusEnabled ? bonusReason.trim() : undefined,
      currencyLocal: form.currencyLocal,
      scheduledDate: new Date(form.scheduledDate),
      notes:        form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); } }}>
      <DialogContent className="flex flex-col w-full sm:max-w-lg overflow-hidden" style={{ maxHeight: '90dvh' }}>
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <DialogHeader className="shrink-0">
          <DialogTitle>{t('payments.newPayment')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">

            {/* Field 1 — Empleado */}
            <div className="space-y-1.5">
              <Label>{t('employees.employee')} *</Label>
              <Select
                value={form.employeeId}
                onValueChange={(v) => { f('employeeId', v); setErrors(e => ({ ...e, employeeId: '' })); }}
              >
                <SelectTrigger className="min-h-[38px]">
                  <SelectValue placeholder={t('payments.employeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(employees?.items ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} — {e.employeeCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.employeeId && <p className="text-[11px] text-rose mt-0.5">{errors.employeeId}</p>}
            </div>

            {/* Field 2 — Período + Fecha programada */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('payments.periodLabel')} *</Label>
                <Input type="month" required className="min-h-[38px]" value={form.period} onChange={(e) => f('period', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('payments.scheduledDateLabel')} *</Label>
                <Input
                  type="date" required className="min-h-[38px]"
                  value={form.scheduledDate}
                  onChange={(e) => { f('scheduledDate', e.target.value); setErrors(er => ({ ...er, scheduledDate: '' })); }}
                />
                {errors.scheduledDate && <p className="text-[11px] text-rose mt-0.5">{errors.scheduledDate}</p>}
              </div>
            </div>

            {/* Field 3 + 4 — Salario base + Moneda */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('payments.baseSalary')} *</Label>
                <Input
                  type="number" min="0.01" step="0.01" placeholder="0.00"
                  className="min-h-[38px]"
                  value={form.baseSalary}
                  onChange={(e) => { f('baseSalary', e.target.value); setErrors(er => ({ ...er, baseSalary: '' })); }}
                />
                {errors.baseSalary && <p className="text-[11px] text-rose mt-0.5">{errors.baseSalary}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t('finance.currency')}</Label>
                <Select value={form.currencyLocal} onValueChange={(v) => f('currencyLocal', v)}>
                  <SelectTrigger className="min-h-[38px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="PEN">PEN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Field 5 — Bonus toggle */}
            <div
              className="flex items-center justify-between transition-all"
              style={{
                background:   bonusEnabled ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.04)',
                border:       bonusEnabled ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(16,185,129,0.15)',
                borderRadius: '8px',
                padding:      '10px 12px',
              }}
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 shrink-0" style={{ color: '#10B981' }} />
                <span className="text-[13px] font-medium select-none" style={{ color: '#10B981' }}>
                  {t('payments.bonusToggle')}
                </span>
              </div>
              <BonusToggle
                checked={bonusEnabled}
                onChange={(v) => {
                  setBonusEnabled(v);
                  if (!v) { setBonusAmount(''); setBonusReason(''); setErrors(e => ({ ...e, bonusAmount: '', bonusReason: '' })); }
                }}
              />
            </div>

            {/* Field 6 — Bonus fields (conditional, animated) */}
            {bonusEnabled && (
              <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
                <div
                  className="grid grid-cols-1 gap-[10px] sm:grid-cols-2"
                  style={{
                    border:       '0.5px solid rgba(16,185,129,0.25)',
                    borderRadius: '8px',
                    padding:      '12px',
                    background:   'rgba(16,185,129,0.04)',
                  }}
                >
                  <div className="space-y-1.5">
                    <Label className="text-[12px]" style={{ color: '#10B981' }}>{t('payments.bonusAmount')}</Label>
                    <Input
                      type="number" min="0.01" step="0.01" placeholder="0.00"
                      className="min-h-[38px]"
                      style={{ border: errors.bonusAmount ? undefined : '1px solid rgba(16,185,129,0.30)', background: 'rgba(16,185,129,0.04)' }}
                      value={bonusAmount}
                      onChange={(e) => { setBonusAmount(e.target.value); setErrors(er => ({ ...er, bonusAmount: '' })); }}
                    />
                    {errors.bonusAmount && <p className="text-[11px] text-rose mt-0.5">{errors.bonusAmount}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]" style={{ color: '#10B981' }}>{t('payments.bonusReason')}</Label>
                    <Input
                      type="text" className="min-h-[38px]"
                      placeholder={t('payments.bonusReasonPlaceholder')}
                      style={{ border: errors.bonusReason ? undefined : '1px solid rgba(16,185,129,0.30)', background: 'rgba(16,185,129,0.04)' }}
                      value={bonusReason}
                      onChange={(e) => { setBonusReason(e.target.value); setErrors(er => ({ ...er, bonusReason: '' })); }}
                    />
                    {errors.bonusReason && <p className="text-[11px] text-rose mt-0.5">{errors.bonusReason}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Field 7 — Total summary box (real-time) */}
            {baseSalaryNum > 0 && (
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background:   'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(6,182,212,0.06))',
                  border:       '1px solid rgba(99,102,241,0.25)',
                  borderRadius: '8px',
                  padding:      '12px 14px',
                }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('payments.totalToPay')}</p>
                  <p className="text-[11px] font-mono text-text-muted mt-0.5">
                    {bonusEnabled && bonusAmountNum > 0
                      ? `${fmtCurrency(baseSalaryNum)} ${t('payments.baseSalaryLabel')} + ${fmtCurrency(bonusAmountNum)} ${t('payments.bonusLabel').toLowerCase()}`
                      : `${fmtCurrency(baseSalaryNum)} ${t('payments.baseSalaryLabel')}`
                    }
                  </p>
                </div>
                <p className="text-[20px] font-bold font-mono" style={{ color: '#6366F1' }}>
                  {fmtCurrency(totalAmount)}
                </p>
              </div>
            )}

            {/* Field 8 — Notas */}
            <div className="space-y-1.5">
              <Label>{t('payments.notesLabel')}</Label>
              <Textarea className="min-h-[38px]" value={form.notes} onChange={(e) => f('notes', e.target.value)} />
            </div>

          </div>

          <DialogFooter className="shrink-0 pt-3">
            <Button type="button" variant="ghost" onClick={() => { onClose(); resetForm(); }}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('payments.createButton')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
