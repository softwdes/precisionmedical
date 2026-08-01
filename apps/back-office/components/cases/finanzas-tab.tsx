'use client';

/**
 * FinanzasTab — Resumen financiero del caso.
 * KPIs · tabla expandible por cita · modal pago con distribución
 */

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign, ChevronRight, ChevronDown, Loader2, RefreshCw,
  Trash2, CreditCard, FileText, X, ChevronUp,
} from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BillingPayment {
  id: string;
  amount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  paymentType: string | null;
  method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE';
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  insuranceCarrier: { id: string; name: string } | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface BillingRecord {
  id: string;
  appointmentId: string | null;
  appointmentDate: string | null;
  appointmentStatus: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
  totalCost: number;
  discount: number;
  insuranceCovered: number;
  amountPaid: number;
  balanceDue: number;
  payments: BillingPayment[];
}

interface CaseInsurance { id: string; name: string; label: string }
interface Kpis { totalCost: number; totalPaid: number; totalBalance: number }

// ─── Payment type options (igual a v2) ─────────────────────────────────────────

const PAYMENT_TYPES: Record<string, { label: string; value: string }[]> = {
  INSURANCE: [
    { label: 'Pago de seguro (Ins)',                value: 'direct_insurance' },
    { label: 'Obligación contractual (CO)',          value: 'contractual_obligation' },
    { label: 'Pérdida por presentación tardía (TF)', value: 'late_filing_penalty' },
  ],
  LAWYER: [
    { label: 'Pago de abogado (Att)',         value: 'attorney_payment' },
    { label: 'Acuerdo de reducción (Red AG)', value: 'reduction_agreement' },
  ],
  PATIENT: [
    { label: 'Copago (Cp)',                    value: 'copay' },
    { label: 'Deducible (Ded)',                value: 'deductible' },
    { label: 'Coaseguro (Coins)',              value: 'coinsurance' },
    { label: 'Pago directo (Self-Pay)',        value: 'patient_direct' },
    { label: 'Cortesía profesional (Pro Cur)', value: 'professional_courtesy' },
    { label: 'Cobranzas externas (Coll)',      value: 'external_collections' },
  ],
};

const METHOD_LABELS: Record<string, string> = {
  CHECK: 'Cheque', CARD: 'Tarjeta', CASH: 'Efectivo', TRANSFER: 'Transferencia', NONE: '—',
};

const SOURCE_LABELS: Record<string, string> = {
  INSURANCE: 'Seguro', PATIENT: 'Paciente', LAWYER: 'Abogado',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function billingStatus(b: BillingRecord): 'paid' | 'partial' | 'pending' {
  if (b.balanceDue <= 0) return 'paid';
  if (b.amountPaid > 0) return 'partial';
  return 'pending';
}

// ─── Custom Select (abre hacia arriba) ─────────────────────────────────────────

interface SelectOption { label: string; value: string }

function SelectUp({
  value, onChange, options, placeholder, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none hover:border-brand/60 transition-colors"
      >
        <span className={selected ? 'text-text-1' : 'text-text-muted'}>
          {selected?.label ?? placeholder ?? 'Seleccionar'}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-bg-1 border border-border rounded-md shadow-xl overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                opt.value === value
                  ? 'bg-brand/10 text-brand'
                  : 'text-text-1 hover:bg-bg-2'
              }`}
            >
              {opt.label}
              {opt.value === value && <span className="text-brand text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4 flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{fmt$(value)}</div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export interface FinanzasTabHandle { openPayModal: () => void; reload: () => void; reloadAndOpen: () => void }

export const FinanzasTab = forwardRef<FinanzasTabHandle, { caseId: string; filterAppointmentId?: string }>(function FinanzasTab({ caseId, filterAppointmentId }, ref) {
  const t  = useTranslations('phoenix.caseTabs.finanzas');
  const tc = useTranslations('phoenix.common');
  const [billings, setBillings]     = useState<BillingRecord[]>([]);
  const [kpis, setKpis]             = useState<Kpis>({ totalCost: 0, totalPaid: 0, totalBalance: 0 });
  const [insurances, setInsurances] = useState<CaseInsurance[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  // Modal
  const [payOpen, setPayOpen]         = useState(false);
  const [payAmounts, setPayAmounts]   = useState<Record<string, string>>({});
  const [payNotes, setPayNotes]       = useState<Record<string, string>>({});
  const [paySource, setPaySource]     = useState<'INSURANCE' | 'PATIENT' | 'LAWYER'>('PATIENT');
  const [payMethod, setPayMethod]     = useState<string>('CHECK');
  const [payType, setPayType]         = useState<string>('');
  const [payInsuranceId, setPayInsuranceId] = useState<string>('');
  const [paying, setPaying]           = useState(false);
  const [deletingPay, setDeletingPay] = useState<string | null>(null);
  const [noteDialogFor, setNoteDialogFor] = useState<string | null>(null); // billingId de la fila con "Nota de pago" abierta
  const [noteDraft, setNoteDraft]         = useState('');
  const openAfterLoad = useRef(false);

  // Cuando se abre desde una cita puntual (calendario), el modal de pago
  // solo debe mostrar los servicios de ESA cita, no todo el caso.
  const pendingOf = useCallback((list: BillingRecord[]) => (
    list.filter(b => b.balanceDue > 0 && (!filterAppointmentId || b.appointmentId === filterAppointmentId))
  ), [filterAppointmentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const freshBillings: BillingRecord[] = data.billings ?? [];
      const freshInsurances: CaseInsurance[] = data.insurances ?? [];
      setBillings(freshBillings);
      setKpis(data.kpis ?? { totalCost: 0, totalPaid: 0, totalBalance: 0 });
      setInsurances(freshInsurances);

      // Open pay modal with fresh data if flagged
      if (openAfterLoad.current) {
        openAfterLoad.current = false;
        const pending = pendingOf(freshBillings);
        const init: Record<string, string> = {};
        pending.forEach(b => { init[b.id] = ''; });
        setPayAmounts(init);
        setPayNotes({});
        setPaySource('PATIENT');
        setPayMethod('CHECK');
        setPayType(PAYMENT_TYPES['PATIENT'][0].value);
        setPayInsuranceId(freshInsurances[0]?.id ?? '');
        setPayOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar finanzas');
    } finally {
      setLoading(false);
    }
  }, [caseId, pendingOf]);

  useEffect(() => { load(); }, [load]);

  function openPayModal() {
    const pending = pendingOf(billings);
    const init: Record<string, string> = {};
    pending.forEach(b => { init[b.id] = ''; });
    setPayAmounts(init);
    setPayNotes({});
    setPaySource('PATIENT');
    setPayMethod('CHECK');
    setPayType(PAYMENT_TYPES['PATIENT'][0].value);
    setPayInsuranceId(insurances[0]?.id ?? '');
    setPayOpen(true);
  }

  useImperativeHandle(ref, () => ({
    openPayModal,
    reload: load,
    reloadAndOpen: () => {
      // Abrir modal inmediatamente con datos existentes, recargar en background
      openPayModal();
      openAfterLoad.current = true;
      load();
    },
  }));

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function autoDistribute(totalStr: string) {
    const raw = parseFloat(totalStr);
    if (isNaN(raw) || raw <= 0) {
      const pending = pendingOf(billings);
      setPayAmounts(prev => { const n = { ...prev }; pending.forEach(b => { n[b.id] = ''; }); return n; });
      return;
    }
    const total = Math.min(raw, totalPending);
    const pending = pendingOf(billings);
    const newAmounts: Record<string, string> = {};
    let remaining = total;
    for (const b of pending) {
      if (remaining <= 0) { newAmounts[b.id] = ''; continue; }
      const apply = Math.min(remaining, b.balanceDue);
      newAmounts[b.id] = apply.toFixed(2);
      remaining -= apply;
    }
    setPayAmounts(prev => ({ ...prev, ...newAmounts }));
  }

  async function submitPayment() {
    const entries = Object.entries(payAmounts)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([billingId, v]) => ({ billingId, amount: parseFloat(v), notes: payNotes[billingId] || null }));

    if (!entries.length) { alert(t('alertMinAmount')); return; }

    setPaying(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: entries,
          source: paySource,
          method: payMethod,
          paymentType: payType || null,
          insuranceCarrierId: paySource === 'INSURANCE' ? (payInsuranceId || null) : null,
          paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? `HTTP ${res.status}`); }
      setPayOpen(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertErrorRegister'));
    } finally {
      setPaying(false);
    }
  }

  async function deletePayment(billingId: string, payId: string) {
    if (!confirm('¿Cancelar este pago? El balance se revertirá.')) return;
    setDeletingPay(payId);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing/${billingId}/payments/${payId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertErrorCancel'));
    } finally {
      setDeletingPay(null);
    }
  }

  const pending     = pendingOf(billings);
  const totalPending = pending.reduce((s, b) => s + b.balanceDue, 0);
  const payTotal    = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const hasOverpay  = pending.some(b => (parseFloat(payAmounts[b.id] ?? '0') || 0) > b.balanceDue);

  // Options for custom selects
  const sourceOptions: SelectOption[] = [
    { label: 'Paciente', value: 'PATIENT' },
    { label: 'Seguro',   value: 'INSURANCE' },
    { label: 'Abogado',  value: 'LAWYER' },
  ];
  const methodOptions: SelectOption[] = [
    { label: 'Cheque',        value: 'CHECK' },
    { label: 'Tarjeta',       value: 'CARD' },
    { label: 'Efectivo',      value: 'CASH' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: '— Sin especificar', value: 'NONE' },
  ];
  const typeOptions: SelectOption[] = PAYMENT_TYPES[paySource] ?? [];
  const insuranceOptions: SelectOption[] = insurances.map(i => ({ label: i.label, value: i.id }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('sectionTitle')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('refresh')}</span>
          </Button>
          {kpis.totalBalance > 0 && (
            <Button size="sm" onClick={openPayModal} className="gap-1.5 bg-amber hover:bg-amber/90 text-black border-0">
              <CreditCard className="w-3.5 h-3.5" /> {t('payDebt')}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label={t('kpiTotalCost')}  value={kpis.totalCost}    color="text-text-1" />
        <KpiCard label={t('kpiTotalPaid')}  value={kpis.totalPaid}    color="text-emerald" />
        <KpiCard label={t('kpiTotalDebt')}  value={kpis.totalBalance} color={kpis.totalBalance > 0 ? 'text-rose' : 'text-text-1'} />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">{error}</div>
      ) : billings.length === 0 ? (
        <EmptyState.Rich
          icon={DollarSign}
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-bg-2/60 border-b border-border">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Detalle por servicio</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-bg-2/40">
                  <th className="sticky left-0 z-10 bg-bg-2 w-6 px-2" />
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted w-56">Servicio / Fecha</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Costo</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">Desc. %</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell">Monto desc.</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pagado</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pendiente</th>
                  <th className="sticky right-0 z-10 bg-bg-2 w-16 px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Notas</th>
                </tr>
              </thead>
              <tbody>
                {billings.map(b => {
                  const st = billingStatus(b);
                  const isExpanded = expanded.has(b.id);
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        className={`border-b border-border/40 hover:bg-white/[0.02] cursor-pointer ${st === 'paid' ? 'opacity-75' : ''}`}
                        onClick={() => toggleExpanded(b.id)}
                      >
                        <td className="sticky left-0 z-10 bg-bg-0 px-2 py-3 text-text-muted">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="px-3 py-3 text-xs max-w-56">
                          {b.serviceCode ? (
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5 min-w-0">
                                <span className="font-mono font-semibold text-cyan shrink-0">{b.serviceCode}</span>
                                <span className="text-text-muted text-[11px] truncate">{b.serviceDescription}</span>
                              </div>
                              <div className="text-[10px] text-text-muted/60 mt-0.5">{fmtDate(b.appointmentDate)}</div>
                            </div>
                          ) : (
                            <span className="font-mono text-text-1">{fmtDate(b.appointmentDate)}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold font-mono text-xs whitespace-nowrap">{fmt$(b.totalCost)}</td>
                        <td className="px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap hidden md:table-cell">
                          {b.discount > 0 ? `${((b.discount / b.totalCost) * 100).toFixed(2)}%` : '0.00%'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap hidden lg:table-cell">{fmt$(b.discount)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                          <span className={b.amountPaid > 0 ? 'text-emerald font-semibold' : 'text-text-muted'}>{fmt$(b.amountPaid)}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                          {b.balanceDue > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold">{fmt$(b.balanceDue)}</span>
                          ) : (
                            <span className="text-emerald font-semibold text-xs">{fmt$(0)}</span>
                          )}
                        </td>
                        <td className="sticky right-0 z-10 bg-bg-0 px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            <button className="p-1 rounded text-text-muted hover:text-cyan transition-colors" title="Nota de cita">
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Sub-filas de pagos */}
                      {isExpanded && (
                        <tr key={`${b.id}-payments`} className="border-b border-border/40 bg-bg-2/30">
                          <td colSpan={8} className="px-6 py-0">
                            {b.payments.length === 0 ? (
                              <div className="py-3 text-text-muted text-xs italic">Sin pagos registrados para esta cita.</div>
                            ) : (
                              <table className="w-full text-xs my-2">
                                <thead>
                                  <tr className="text-text-muted">
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">Fecha pago</th>
                                    <th className="text-right py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">Cantidad</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Método</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Pagado por</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden md:table-cell">Estado</th>
                                    <th className="w-8" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                  {b.payments.map(p => (
                                    <tr key={p.id} className={p.status === 'CANCELLED' ? 'opacity-40' : ''}>
                                      <td className="py-1.5 pr-4 font-mono text-text-2">{fmtDate(p.paidAt)}</td>
                                      <td className="py-1.5 pr-4 text-right font-mono font-semibold text-emerald whitespace-nowrap">{fmt$(p.amount)}</td>
                                      <td className="py-1.5 pr-4 text-text-2 hidden sm:table-cell">{METHOD_LABELS[p.method] ?? p.method}</td>
                                      <td className="py-1.5 pr-4 text-text-2 hidden sm:table-cell">
                                        {SOURCE_LABELS[p.source] ?? p.source}
                                        {p.insuranceCarrier && <span className="text-text-muted"> · {p.insuranceCarrier.name}</span>}
                                      </td>
                                      <td className="py-1.5 pr-4 hidden md:table-cell">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                          p.status === 'COMPLETED' ? 'bg-emerald/10 text-emerald' :
                                          p.status === 'CANCELLED' ? 'bg-rose/10 text-rose' : 'bg-amber/10 text-amber'
                                        }`}>
                                          {p.status === 'COMPLETED' ? 'Completado' : p.status === 'CANCELLED' ? 'Cancelado' : 'Pendiente'}
                                        </span>
                                      </td>
                                      <td className="py-1.5">
                                        {p.status !== 'CANCELLED' && (
                                          <button
                                            onClick={() => deletePayment(b.id, p.id)}
                                            disabled={deletingPay === p.id}
                                            className="p-1 rounded text-text-muted hover:text-rose transition-colors disabled:opacity-50"
                                            title={tc('cancelPayment')}
                                          >
                                            {deletingPay === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Pagar deuda ───────────────────────────────────────────────────
          Usa el primitivo Dialog (Regla #0) en vez de un overlay `fixed` propio.
          Importa por dos razones concretas: (1) DialogContent portalea solo a
          body, asi que escapa del translate-x/y-[-50%] del dialogo de la cita
          -- un ancestro con `transform` se vuelve el bloque contenedor de sus
          descendientes `fixed` (spec CSS), y por eso antes quedaba encerrado en
          los 768px del padre; (2) Radix maneja dialogos anidados, incluyendo el
          pointer-events/focus trap -- un portal manual a body quedaba fuera de
          su subarbol y el modal se veia pero no se podia clickear. */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="px-5 py-4 border-b border-border shrink-0">
              <DialogTitle className="text-text-1 font-semibold text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber" /> Pago del caso
              </DialogTitle>
              <p className="text-text-muted text-xs mt-0.5">Complete el pago para el caso seleccionado abajo.</p>
            </div>

            {/* Zona scrolleable — si la ventana es baja, el contenido scrollea
                en vez de quedar recortado por el max-h del dialogo. El footer
                de "Registrar pago" queda siempre visible abajo. */}
            <div className="flex-1 min-h-0 overflow-y-auto">

            {/* Summary bar */}
            <div className="grid grid-cols-2 border-b border-border">
              <div className="px-5 py-3 border-r border-border">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Total pendiente</div>
                <div className="text-xl font-bold font-mono text-rose mt-0.5">{fmt$(totalPending)}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pagos pendientes</div>
                <div className="text-xl font-bold font-mono text-text-1 mt-0.5">{pending.length}</div>
              </div>
            </div>

            {/* Distribution table — grid en vez de <table>: con fr las columnas
                SIEMPRE suman exactamente el 100% del ancho disponible, sin la
                ambiguedad de table-layout (fixed/auto) combinado con celdas
                sticky, que nunca terminaba de encajar sin scroll. */}
            {(() => {
              // Cada piso sale del ancho real de su header (10px uppercase +
              // tracking + px-3), con holgura. Ojo con la ultima columna: es la
              // unica de ancho FIJO, asi que es la unica que puede desbordar --
              // las demas son fr y se expanden por encima de su piso. Con 44px
              // el texto "NOTAS" (~62px con padding) se salia, y ese desborde
              // alimentaba el area scrolleable del overflow-x-auto: de ahi la
              // barra horizontal que no se iba. Suman ~828px contra los 896px
              // del max-w-4xl, ~68px de holgura.
              const GRID_COLS = 'grid-cols-[minmax(170px,1.5fr)_minmax(85px,0.6fr)_minmax(105px,0.7fr)_minmax(110px,0.75fr)_minmax(85px,0.6fr)_minmax(95px,0.7fr)_minmax(110px,0.8fr)_68px]';
              return (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <div className={`sticky top-0 z-20 grid ${GRID_COLS} bg-bg-2/95 backdrop-blur-sm border-b border-border`}>
                    <div className="min-w-0 sticky left-0 z-10 bg-bg-2 text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Servicio / Fecha</div>
                    <div className="min-w-0 flex items-center justify-end px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right whitespace-nowrap">Costo</div>
                    <div className="min-w-0 flex items-center justify-end px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right whitespace-nowrap">Descuento %</div>
                    <div className="min-w-0 flex items-center justify-end px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right whitespace-nowrap">Monto desc.</div>
                    <div className="min-w-0 flex items-center justify-end px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right whitespace-nowrap">Pagado</div>
                    <div className="min-w-0 flex items-center justify-end px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right whitespace-nowrap">Pendiente</div>
                    <div className="min-w-0 px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Pagar</div>
                    <div className="min-w-0 sticky right-0 z-10 bg-bg-2 px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Notas</div>
                  </div>
                  <div className="divide-y divide-row-sep">
                    {pending.map(b => {
                      const discPct = b.totalCost > 0 ? ((b.discount / b.totalCost) * 100).toFixed(2) : '0.00';
                      return (
                        <div key={b.id} className={`grid ${GRID_COLS} hover:bg-white/[0.02]`}>
                          <div className="min-w-0 sticky left-0 z-10 bg-surface px-4 py-3 text-xs">
                            {b.serviceCode ? (
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-1.5 min-w-0">
                                  <span className="font-mono font-semibold text-cyan shrink-0">{b.serviceCode}</span>
                                  <span className="text-text-muted text-[11px] truncate">{b.serviceDescription}</span>
                                </div>
                                <div className="text-[10px] text-text-muted/60 mt-0.5">{fmtDate(b.appointmentDate)}</div>
                              </div>
                            ) : (
                              <span className="font-mono text-text-1">{fmtDate(b.appointmentDate)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex items-center justify-end px-3 py-3 text-right font-mono text-xs whitespace-nowrap">{fmt$(b.totalCost)}</div>
                          <div className="min-w-0 flex items-center justify-end px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap">{discPct}%</div>
                          <div className="min-w-0 flex items-center justify-end px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap">{fmt$(b.discount)}</div>
                          <div className="min-w-0 flex items-center justify-end px-3 py-3 text-right text-emerald font-mono text-xs whitespace-nowrap">{fmt$(b.amountPaid)}</div>
                          <div className="min-w-0 flex items-center justify-end px-3 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold whitespace-nowrap">
                              {fmt$(b.balanceDue)}
                            </span>
                          </div>
                          <div className="min-w-0 flex items-center px-3 py-3">
                            <input
                              type="number"
                              min="0"
                              max={b.balanceDue}
                              step="0.01"
                              value={payAmounts[b.id] ?? ''}
                              onChange={e => {
                                const raw = e.target.value;
                                setPayAmounts(prev => ({ ...prev, [b.id]: raw }));
                              }}
                              onBlur={e => {
                                const raw = parseFloat(e.target.value);
                                if (!isNaN(raw)) {
                                  const clamped = Math.min(Math.max(0, raw), b.balanceDue);
                                  setPayAmounts(prev => ({ ...prev, [b.id]: clamped.toFixed(2) }));
                                }
                              }}
                              className={`min-w-0 w-full rounded-md bg-bg-2 border px-2 py-1 text-xs font-mono text-right outline-none transition-colors ${
                                parseFloat(payAmounts[b.id] ?? '0') > b.balanceDue
                                  ? 'border-rose text-rose focus:border-rose'
                                  : 'border-border text-text-1 focus:border-brand'
                              }`}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="min-w-0 sticky right-0 z-10 bg-surface px-3 py-3 flex items-center justify-center">
                            <button
                              type="button"
                              disabled={!(parseFloat(payAmounts[b.id] ?? '0') > 0)}
                              onClick={() => { setNoteDraft(payNotes[b.id] ?? ''); setNoteDialogFor(b.id); }}
                              className={`p-1 rounded transition-colors hover:text-cyan disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted ${
                                payNotes[b.id] ? 'text-cyan' : 'text-text-muted'
                              }`}
                              title={payAmounts[b.id] ? 'Nota de pago' : 'Ingresa un monto a pagar para agregar una nota'}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            </div>{/* /zona scrolleable */}

            {/* Registrar pago — footer */}
            <div className="shrink-0 px-5 py-4 border-t border-border bg-bg-2/30 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Registrar pago</div>

              {/* Fila selects: Source | Método | Tipo  (para Seguro: Source | Método | Carrier) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SelectUp
                  value={paySource}
                  onChange={v => {
                    const src = v as typeof paySource;
                    setPaySource(src);
                    setPayType(PAYMENT_TYPES[src]?.[0]?.value ?? '');
                    if (src === 'INSURANCE') setPayInsuranceId(insurances[0]?.id ?? '');
                  }}
                  options={sourceOptions}
                />
                <SelectUp
                  value={payMethod}
                  onChange={setPayMethod}
                  options={methodOptions}
                />
                {paySource === 'INSURANCE' ? (
                  <SelectUp
                    value={payInsuranceId}
                    onChange={setPayInsuranceId}
                    options={insuranceOptions.length ? insuranceOptions : [{ label: 'Sin seguros en el caso', value: '' }]}
                    placeholder={t('placeholderInsurance')}
                  />
                ) : (
                  <SelectUp
                    value={payType}
                    onChange={setPayType}
                    options={typeOptions}
                  />
                )}
              </div>

              {/* Segunda fila: tipo de pago del seguro (ancho completo) */}
              {paySource === 'INSURANCE' && (
                <SelectUp
                  value={payType}
                  onChange={setPayType}
                  options={typeOptions}
                />
              )}

              {/* Fila acción: input ancho completo + botón */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={totalPending}
                  step="0.01"
                  placeholder={`Distribuir hasta ${fmt$(totalPending)}`}
                  onChange={e => {
                    const raw = parseFloat(e.target.value);
                    if (!isNaN(raw) && raw > totalPending) {
                      e.target.value = totalPending.toFixed(2);
                      autoDistribute(totalPending.toFixed(2));
                    } else {
                      autoDistribute(e.target.value);
                    }
                  }}
                  className="flex-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 font-mono outline-none focus:border-brand"
                  title={t('tipAutoDistribute')}
                />
                <Button
                  size="sm"
                  onClick={submitPayment}
                  disabled={paying || payTotal <= 0 || hasOverpay}
                  className="gap-1.5 bg-amber hover:bg-amber/90 text-black border-0 whitespace-nowrap"
                >
                  {paying
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando…</>
                    : <>+ Pagar{payTotal > 0 ? ` ${fmt$(payTotal)}` : '…'}</>
                  }
                </Button>
              </div>
            </div>

            {/* Nota de pago — overlay dentro del modal (no un segundo fixed
                encima, para no repetir el problema de dos fondos oscuros
                apilados que ya tuvimos con Servicios + Pagar deuda). */}
            {noteDialogFor && (() => {
              const b = billings.find(x => x.id === noteDialogFor);
              if (!b) return null;
              return (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
                  onClick={() => setNoteDialogFor(null)}
                >
                  <div
                    className="bg-bg-1 border border-border rounded-xl w-full max-w-md shadow-2xl"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                      <div>
                        <h3 className="text-text-1 font-semibold text-base">Nota de pago</h3>
                        <p className="text-text-muted text-xs mt-0.5">Agrega una nota para el pago aplicado al DOS {fmtDate(b.appointmentDate)}</p>
                      </div>
                      <button onClick={() => setNoteDialogFor(null)} className="text-text-muted hover:text-text-1 transition-colors p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-text-1">Notas</label>
                        <span className="text-[10px] text-text-muted">{noteDraft.length} caracteres</span>
                      </div>
                      <textarea
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        rows={4}
                        placeholder="Agrega detalles del pago, número de cheque, referencia, etc..."
                        className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
                      />
                    </div>
                    <div className="px-5 py-4 border-t border-border flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayNotes(prev => ({ ...prev, [noteDialogFor]: noteDraft }));
                          setNoteDialogFor(null);
                        }}
                      >
                        Guardar nota
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

        </DialogContent>
      </Dialog>
    </div>
  );
});
