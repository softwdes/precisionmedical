'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Card, CardContent,
} from '@precision/ui';
import {
  CheckCircle, Clock, X, RotateCcw, Pencil, QrCode, DollarSign,
  Calendar, AlertCircle, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type PagosListOutput = inferRouterOutputs<AppRouter>['freelancers']['listPagos'];
type PagoItem        = PagosListOutput['items'][number];
type ListOutput      = inferRouterOutputs<AppRouter>['freelancers']['list'];
type FreelancerItem  = ListOutput['items'][number];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  PAID:      'success',
  PENDING:   'warning',
  CANCELLED: 'destructive',
  REVERSED:  'secondary',
};

const MODALIDAD_VARIANT: Record<string, 'info' | 'secondary' | 'success'> = {
  POR_HORA:     'info',
  POR_SERVICIO: 'secondary',
  CONTRATISTA:  'success',
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', BOB: 'Bs', PEN: 'S/' };

function fmtAmount(amount: number, currency: string): string {
  const sym  = CURRENCY_SYMBOL[currency] ?? '';
  const sign = amount < 0 ? '-' : '';
  return `${sign}${sym} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FreelancersPagosClient({
  allFreelancers,
}: {
  allFreelancers: FreelancerItem[];
}): React.ReactElement {
  const t      = useTranslations();
  const locale = useLocale();

  const [page,         setPage]         = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState<string | null>(null);
  const [showCancel,   setShowCancel]   = useState<string | null>(null);
  const [showReverse,  setShowReverse]  = useState<string | null>(null);
  const [showEdit,     setShowEdit]     = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const { data, refetch } = trpc.freelancers.listPagos.useQuery({
    page,
    pageSize: 25,
    status:   (statusFilter as 'PENDING' | 'PAID' | 'CANCELLED' | 'REVERSED' | undefined) || undefined,
  });

  const { data: summary, refetch: refetchSummary } = trpc.freelancers.getPagosSummary.useQuery({});

  const items = (data?.items ?? []) as PagoItem[];

  const markPaid = trpc.freelancers.markPagoAsPaid.useMutation({
    onSuccess: () => { toast.success(t('freelancers.marked')); setShowMarkPaid(null); void refetch(); void refetchSummary(); },
    onError:   (e) => toast.error(e.message),
  });

  const cancelMut = trpc.freelancers.cancelPago.useMutation({
    onSuccess: () => { toast.success(t('freelancers.cancelled')); setShowCancel(null); void refetch(); void refetchSummary(); },
    onError:   (e) => toast.error(e.message),
  });

  const reverseMut = trpc.freelancers.reversePago.useMutation({
    onSuccess: () => { toast.success(t('freelancers.reversed')); setShowReverse(null); setReverseReason(''); void refetch(); void refetchSummary(); },
    onError:   (e) => toast.error(e.message),
  });

  const fmtDate = (d: string | null | undefined): string =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // KPI: format paid this month by currency
  const renderMultiCurrency = (obj: Record<string, number> | undefined): React.ReactElement => {
    const entries = Object.entries(obj ?? {});
    if (entries.length === 0) return <span className="text-text-muted text-small font-mono">$0.00</span>;
    return (
      <span className="flex flex-wrap gap-2">
        {entries.map(([cur, amt]) => (
          <span key={cur} className="font-mono text-base font-bold text-text-1">
            {fmtAmount(amt, cur)} <span className="text-tiny text-text-3">{cur}</span>
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-1">{t('freelancers.pagosTitle')}</h2>
          <p className="text-small text-text-3">{t('freelancers.pagosSubtitle')}</p>
        </div>
        <Button onClick={() => setShowSchedule(true)}>
          <Plus className="h-4 w-4" />
          {t('freelancers.schedulePayment')}
        </Button>
      </div>

      {/* ─── KPIs ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">{t('freelancers.pagosPagadosMes')}</p>
                {renderMultiCurrency(summary?.paidThisMonth)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">
                  {t('freelancers.pagosPendientes')} ({summary?.countPending ?? 0})
                </p>
                {renderMultiCurrency(summary?.pending)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-brand/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-brand" />
              </div>
              <div>
                <p className="text-tiny text-text-3 uppercase tracking-wide">{t('freelancers.pagosTotal')}</p>
                <p className="text-lg font-bold text-text-1 font-mono">{summary?.count ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filter ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="PENDING">{t('freelancers.statusPENDING')}</SelectItem>
            <SelectItem value="PAID">{t('freelancers.statusPAID')}</SelectItem>
            <SelectItem value="CANCELLED">{t('freelancers.statusCANCELLED')}</SelectItem>
            <SelectItem value="REVERSED">{t('freelancers.statusREVERSED')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Table ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-16 text-text-3">
            <AlertCircle className="h-10 w-10 mx-auto text-text-muted mb-2" />
            <p className="text-small">{t('freelancers.noPagosPendientes')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ minWidth: 180 }}>{t('freelancers.freelancer')}</TableHead>
                  <TableHead style={{ minWidth: 100 }}>{t('freelancers.modalidad')}</TableHead>
                  <TableHead>{t('freelancers.descripcion')}</TableHead>
                  <TableHead className="text-right">{t('freelancers.monto')}</TableHead>
                  <TableHead>{t('freelancers.scheduledDate')}</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => {
                  const fl       = (p.freelancer as unknown) as { id: string; nombre: string; pais: string; modalidad: string; moneda: string; bankQrUrl: string | null };
                  const monto    = Number(p.monto);
                  const moneda   = p.moneda as string;
                  const status   = p.status as string;
                  return (
                    <TableRow key={p.id as string}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-brand/10 text-brand text-tiny font-bold flex items-center justify-center shrink-0">
                            {fl?.nombre?.slice(0, 2).toUpperCase() ?? '—'}
                          </div>
                          <div>
                            <p className="text-small font-medium text-text-1">{fl?.nombre ?? '—'}</p>
                            <p className="text-tiny text-text-muted">{fl?.pais}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={MODALIDAD_VARIANT[p.modalidad as string] ?? 'secondary'}>
                          {t(`freelancers.modalidades.${p.modalidad as string}` as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-small text-text-2 max-w-xs truncate" title={p.descripcion as string}>
                        {p.descripcion as string}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono font-bold text-small ${monto < 0 ? 'text-rose-500' : 'text-text-1'}`}>
                          {fmtAmount(monto, moneda)} <span className="text-tiny text-text-3">{moneda}</span>
                        </span>
                        {p.modalidad === 'POR_HORA' && p.horas != null && (
                          <p className="text-tiny text-text-muted">{String(p.horas)}h × ${String(p.tarifaHora ?? 0)}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-small text-text-2">
                        {status === 'PAID' ? fmtDate(p.paidDate as string | null) : fmtDate(p.scheduledDate as string | null)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
                          {t(`freelancers.status${status}` as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => setShowEdit(p.id as string)}
                                className="p-1.5 text-text-muted hover:text-brand transition-colors rounded"
                                title={t('freelancers.editPayment')}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setShowMarkPaid(p.id as string)}
                                className="p-1.5 text-text-muted hover:text-emerald-500 transition-colors rounded"
                                title={t('freelancers.markAsPaid')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setShowCancel(p.id as string)}
                                className="p-1.5 text-text-muted hover:text-rose-500 transition-colors rounded"
                                title={t('freelancers.cancelPayment')}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {status === 'PAID' && !p.reversedById && (
                            <button
                              onClick={() => setShowReverse(p.id as string)}
                              className="p-1.5 text-text-muted hover:text-amber-500 transition-colors rounded"
                              title={t('freelancers.reversePayment')}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ─── Pagination ──────────────────────────────────────── */}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('freelancers.page')} {page} {t('freelancers.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      {/* ─── Schedule Payment Dialog ─────────────────────────── */}
      {showSchedule && (
        <SchedulePaymentDialog
          allFreelancers={allFreelancers}
          onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); void refetch(); void refetchSummary(); }}
        />
      )}

      {/* ─── Mark as Paid Dialog (con QR) ────────────────────── */}
      <Dialog open={!!showMarkPaid} onOpenChange={(o) => { if (!o) setShowMarkPaid(null); }}>
        <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-md overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle>{t('freelancers.markAsPaid')}</DialogTitle></DialogHeader>
          {(() => {
            const pago = items.find(i => i.id === showMarkPaid);
            const fl   = pago?.freelancer as { nombre?: string; bankQrUrl?: string | null } | null;
            return (
              <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-4">
                <p className="text-small text-text-3">{t('freelancers.markAsPaidConfirm')}</p>
                {pago && (
                  <div className="rounded-lg border border-border bg-surface p-3 text-small space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-text-3">{t('freelancers.freelancer')}</span>
                      <span className="font-medium text-text-1">{fl?.nombre ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-text-3">{t('freelancers.descripcion')}</span>
                      <span className="text-text-2 truncate max-w-[200px]" title={pago.descripcion as string}>{pago.descripcion as string}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-text-3">{t('common.total')}</span>
                      <span className="font-semibold text-emerald-500 font-mono">
                        {fmtAmount(Number(pago.monto), pago.moneda as string)} {pago.moneda as string}
                      </span>
                    </div>
                  </div>
                )}
                {fl?.bankQrUrl ? (
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-tiny text-text-3 uppercase tracking-wide font-medium">
                      <QrCode className="h-3.5 w-3.5" />
                      {t('freelancers.scanQrToPay')}
                    </div>
                    <img
                      src={fl.bankQrUrl}
                      alt="QR bancario"
                      className="h-52 w-52 rounded-xl border border-border object-contain bg-white p-2"
                    />
                  </div>
                ) : (
                  <p className="text-tiny text-text-muted text-center py-1">{t('freelancers.noQrConfigured')}</p>
                )}
              </div>
            );
          })()}
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="ghost" onClick={() => setShowMarkPaid(null)}>{t('common.cancel')}</Button>
            <Button loading={markPaid.isPending} onClick={() => showMarkPaid && markPaid.mutate({ id: showMarkPaid })}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Dialog ───────────────────────────────────── */}
      <Dialog open={!!showCancel} onOpenChange={(o) => { if (!o) setShowCancel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('freelancers.cancelPayment')}</DialogTitle></DialogHeader>
          <p className="text-small text-text-3 py-2">{t('freelancers.cancelConfirm')}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCancel(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" loading={cancelMut.isPending}
              onClick={() => showCancel && cancelMut.mutate({ id: showCancel })}
            >
              {t('freelancers.cancelPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reverse Dialog ──────────────────────────────────── */}
      <Dialog open={!!showReverse} onOpenChange={(o) => { if (!o) { setShowReverse(null); setReverseReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('freelancers.reversePayment')}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t('freelancers.reverseReason')} *</Label>
            <Textarea
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder={t('freelancers.reverseReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowReverse(null); setReverseReason(''); }}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              loading={reverseMut.isPending}
              disabled={!reverseReason.trim() || reverseReason.trim().length < 3}
              onClick={() => showReverse && reverseMut.mutate({ id: showReverse, reason: reverseReason })}
            >
              {t('freelancers.reverseButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Pending Payment Dialog ─────────────────────── */}
      {showEdit && (
        <EditPaymentDialog
          pagoId={showEdit}
          pago={items.find(p => p.id === showEdit) ?? null}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); void refetch(); void refetchSummary(); }}
        />
      )}
    </div>
  );
}

// ─── Schedule (new pending) Dialog ────────────────────────────────────────────

function SchedulePaymentDialog({
  allFreelancers, onClose, onSaved,
}: {
  allFreelancers: FreelancerItem[];
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const t = useTranslations();

  const [freelancerId, setFreelancerId] = useState<string>(allFreelancers[0]?.id ?? '');
  const sel = allFreelancers.find(f => f.id === freelancerId) ?? allFreelancers[0];
  const modalidad = (sel?.modalidad as string) ?? 'POR_SERVICIO';

  const [form, setForm] = useState({
    descripcion:   '',
    horas:         '',
    tarifaHora:    String((sel?.tarifaBase as number | null | undefined) ?? ''),
    monto:         '',
    moneda:        (sel?.moneda as string) ?? 'USD',
    fechaServicio: '',
    scheduledDate: '',
    notas:         '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const horasNum  = parseFloat(form.horas) || 0;
  const tarifaNum = parseFloat(form.tarifaHora) || 0;
  const calculado = modalidad === 'POR_HORA' ? horasNum * tarifaNum : parseFloat(form.monto) || 0;

  const onFreelancerChange = (id: string): void => {
    const fl = allFreelancers.find(x => x.id === id);
    if (!fl) return;
    setFreelancerId(id);
    setForm(p => ({
      ...p,
      moneda:     (fl.moneda as string) ?? 'USD',
      tarifaHora: fl.modalidad === 'POR_HORA' && fl.tarifaBase != null ? String(fl.tarifaBase) : '',
      monto:      '',
    }));
  };

  const create = trpc.freelancers.createPayment.useMutation({
    onSuccess: () => { toast.success('Pago programado'); onSaved(); },
    onError:   (e) => toast.error(e.message),
  });

  const canSubmit =
    !!freelancerId &&
    form.descripcion.length >= 3 &&
    form.fechaServicio &&
    form.scheduledDate &&
    (modalidad === 'POR_HORA' ? horasNum > 0 && tarifaNum > 0 : parseFloat(form.monto) > 0);

  const handleSubmit = (): void => {
    create.mutate({
      freelancerId,
      descripcion:   form.descripcion,
      horas:         modalidad === 'POR_HORA' ? horasNum : undefined,
      tarifaHora:    modalidad === 'POR_HORA' ? tarifaNum : undefined,
      monto:         calculado,
      moneda:        form.moneda as 'USD' | 'BOB' | 'PEN',
      fechaServicio: new Date(form.fechaServicio),
      scheduledDate: new Date(form.scheduledDate),
      status:        'PENDING',
      notas:         form.notas || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('freelancers.schedulePayment')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('freelancers.freelancer')} *</Label>
            <Select value={freelancerId} onValueChange={onFreelancerChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allFreelancers.map(fl => (
                  <SelectItem key={fl.id} value={fl.id}>{fl.nombre as string}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={MODALIDAD_VARIANT[modalidad] ?? 'secondary'}>
              {t(`freelancers.modalidades.${modalidad}` as Parameters<typeof t>[0])}
            </Badge>
            <span className="text-small text-text-3">{form.moneda}</span>
          </div>

          <div className="space-y-1.5">
            <Label>{t('freelancers.descripcion')} *</Label>
            <Input value={form.descripcion} onChange={(e) => f('descripcion', e.target.value)} placeholder={t('freelancers.descripcionPlaceholder')} />
          </div>

          {modalidad === 'POR_HORA' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('freelancers.horas')} *</Label>
                <Input type="number" min="0" step="0.5" value={form.horas} onChange={(e) => f('horas', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('freelancers.tarifaHora')} *</Label>
                <Input type="number" min="0" step="0.01" value={form.tarifaHora} onChange={(e) => f('tarifaHora', e.target.value)} placeholder="0.00" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('freelancers.monto')} *</Label>
              <Input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => f('monto', e.target.value)} placeholder="0.00" />
            </div>
          )}

          {calculado > 0 && (
            <div className="rounded-lg bg-brand/5 border border-brand/20 px-4 py-3 flex justify-between">
              <span className="text-small text-text-3">{t('freelancers.totalCalculado')}</span>
              <span className="text-base font-bold font-mono text-brand">
                {fmtAmount(calculado, form.moneda)} {form.moneda}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('freelancers.fechaServicio')} *</Label>
              <Input type="date" value={form.fechaServicio} onChange={(e) => f('fechaServicio', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('freelancers.scheduledDate')} *</Label>
              <Input type="date" value={form.scheduledDate} onChange={(e) => f('scheduledDate', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('freelancers.notas')}</Label>
            <Input value={form.notas} onChange={(e) => f('notas', e.target.value)} placeholder={t('freelancers.notasPlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!canSubmit}>
            <Calendar className="h-4 w-4" /> {t('freelancers.schedulePayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit pending payment Dialog ─────────────────────────────────────────────

function EditPaymentDialog({
  pagoId, pago, onClose, onSaved,
}: {
  pagoId: string;
  pago:   PagoItem | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const modalidad = (pago?.modalidad as string) ?? 'POR_SERVICIO';

  const [form, setForm] = useState({
    descripcion:   (pago?.descripcion as string) ?? '',
    horas:         pago?.horas         != null ? String(pago.horas)         : '',
    tarifaHora:    pago?.tarifaHora    != null ? String(pago.tarifaHora)    : '',
    monto:         pago?.monto         != null ? String(pago.monto)         : '',
    scheduledDate: (pago?.scheduledDate as string) ?? '',
    notas:         (pago?.notas as string)         ?? '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const update = trpc.freelancers.updatePago.useMutation({
    onSuccess: () => { toast.success(t('common.saved')); onSaved(); },
    onError:   (e) => toast.error(e.message),
  });

  const horasNum  = parseFloat(form.horas) || 0;
  const tarifaNum = parseFloat(form.tarifaHora) || 0;
  const calculado = modalidad === 'POR_HORA' ? horasNum * tarifaNum : parseFloat(form.monto) || 0;

  const handleSubmit = (): void => {
    update.mutate({
      id:            pagoId,
      descripcion:   form.descripcion || undefined,
      horas:         modalidad === 'POR_HORA' ? horasNum : undefined,
      tarifaHora:    modalidad === 'POR_HORA' ? tarifaNum : undefined,
      monto:         calculado > 0 ? calculado : undefined,
      scheduledDate: form.scheduledDate ? new Date(form.scheduledDate) : undefined,
      notas:         form.notas || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('freelancers.editPayment')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('freelancers.descripcion')}</Label>
            <Input value={form.descripcion} onChange={(e) => f('descripcion', e.target.value)} />
          </div>
          {modalidad === 'POR_HORA' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('freelancers.horas')}</Label>
                <Input type="number" min="0" step="0.5" value={form.horas} onChange={(e) => f('horas', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('freelancers.tarifaHora')}</Label>
                <Input type="number" min="0" step="0.01" value={form.tarifaHora} onChange={(e) => f('tarifaHora', e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('freelancers.monto')}</Label>
              <Input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => f('monto', e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('freelancers.scheduledDate')}</Label>
            <Input type="date" value={form.scheduledDate} onChange={(e) => f('scheduledDate', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('freelancers.notas')}</Label>
            <Input value={form.notas} onChange={(e) => f('notas', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} loading={update.isPending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
