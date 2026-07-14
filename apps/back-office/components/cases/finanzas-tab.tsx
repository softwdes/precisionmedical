'use client';

/**
 * FinanzasTab — Resumen financiero del caso.
 *
 * • KPIs: Costo Total / Total Pagado / Deuda Total
 * • Tabla "Detalle por cita" expandible con sub-filas de pagos
 * • Modal "Pagar deuda" con distribución manual + registro de pago
 * • Eliminar pago individual (revert)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, ChevronRight, ChevronDown, Loader2, RefreshCw,
  Trash2, CreditCard, FileText, X,
} from 'lucide-react';
import { Button } from '@precision/ui';
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
  totalCost: number;
  discount: number;
  insuranceCovered: number;
  amountPaid: number;
  balanceDue: number;
  payments: BillingPayment[];
}

interface Kpis { totalCost: number; totalPaid: number; totalBalance: number }

// ─── Payment type options ───────────────────────────────────────────────────────

const PAYMENT_TYPES: Record<string, { label: string; value: string }[]> = {
  INSURANCE: [
    { label: 'Pago de seguro (Ins)',              value: 'direct_insurance' },
    { label: 'Obligación contractual (CO)',        value: 'contractual_obligation' },
    { label: 'Pérdida por presentación tardía (TF)', value: 'late_filing_penalty' },
  ],
  LAWYER: [
    { label: 'Pago de abogado (Att)', value: 'attorney_payment' },
  ],
  PATIENT: [
    { label: 'Pago directo',  value: 'patient_direct' },
    { label: 'Copago',        value: 'copay' },
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

export function FinanzasTab({ caseId }: { caseId: string }) {
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [kpis, setKpis]         = useState<Kpis>({ totalCost: 0, totalPaid: 0, totalBalance: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Payment modal
  const [payOpen, setPayOpen]     = useState(false);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [payNotes, setPayNotes]   = useState<Record<string, string>>({});
  const [paySource, setPaySource] = useState<'INSURANCE' | 'PATIENT' | 'LAWYER'>('INSURANCE');
  const [payMethod, setPayMethod] = useState<string>('CHECK');
  const [payType, setPayType]     = useState<string>('');
  const [paying, setPaying]       = useState(false);

  // Delete payment
  const [deletingPay, setDeletingPay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBillings(data.billings ?? []);
      setKpis(data.kpis ?? { totalCost: 0, totalPaid: 0, totalBalance: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar finanzas');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  // When opening payment modal, auto-init amounts (distribute from most recent to oldest)
  function openPayModal() {
    const pending = billings.filter(b => b.balanceDue > 0);
    const init: Record<string, string> = {};
    pending.forEach(b => { init[b.id] = ''; });
    setPayAmounts(init);
    setPayNotes({});
    setPaySource('INSURANCE');
    setPayMethod('CHECK');
    setPayType(PAYMENT_TYPES['INSURANCE'][0].value);
    setPayOpen(true);
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Auto-distribute a total amount from most recent to oldest
  function autoDistribute(totalStr: string) {
    const total = parseFloat(totalStr);
    if (!total || total <= 0) return;
    const pending = billings.filter(b => b.balanceDue > 0);
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
      .map(([billingId, v]) => ({
        billingId,
        amount: parseFloat(v),
        notes: payNotes[billingId] || null,
      }));

    if (entries.length === 0) {
      alert('Ingresa al menos un monto mayor a 0.');
      return;
    }

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
          paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? `HTTP ${res.status}`);
      }
      setPayOpen(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al registrar pago');
    } finally {
      setPaying(false);
    }
  }

  async function deletePayment(billingId: string, payId: string) {
    if (!confirm('¿Cancelar este pago? El balance se revertirá.')) return;
    setDeletingPay(payId);
    try {
      const res = await fetch(
        `/api/admin/cases/${caseId}/billing/${billingId}/payments/${payId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cancelar pago');
    } finally {
      setDeletingPay(null);
    }
  }

  const pending = billings.filter(b => b.balanceDue > 0);
  const totalPending = pending.reduce((s, b) => s + b.balanceDue, 0);
  const payTotal = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Resumen financiero</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          {kpis.totalBalance > 0 && (
            <Button size="sm" onClick={openPayModal} className="gap-1.5 bg-amber hover:bg-amber/90 text-black border-0">
              <CreditCard className="w-3.5 h-3.5" />
              Pagar deuda
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label="Costo Total"   value={kpis.totalCost}    color="text-text-1" />
        <KpiCard label="Total Pagado"  value={kpis.totalPaid}    color="text-emerald" />
        <KpiCard label="Deuda Total"   value={kpis.totalBalance} color={kpis.totalBalance > 0 ? 'text-rose' : 'text-text-1'} />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">{error}</div>
      ) : billings.length === 0 ? (
        <EmptyState.Rich
          icon={DollarSign}
          title="Sin registros de facturación"
          subtitle="Los registros aparecen al asignar servicios a las citas del caso."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-bg-2/60 border-b border-border">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Detalle por cita</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-bg-2/40">
                  <th className="w-6 px-2" />
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Fecha de cita</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Total</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">Descuento</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell">Total descontado</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pagado</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Balance</th>
                  <th className="w-20 px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {billings.map(b => {
                  const st = billingStatus(b);
                  const isExpanded = expanded.has(b.id);
                  const totalDescontado = b.totalCost - b.discount;

                  return (
                    <>
                      <tr
                        key={b.id}
                        className={`border-b border-border/40 hover:bg-white/[0.02] cursor-pointer ${st === 'paid' ? 'opacity-75' : ''}`}
                        onClick={() => toggleExpanded(b.id)}
                      >
                        <td className="px-2 py-3 text-text-muted">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />
                          }
                        </td>
                        <td className="px-3 py-3 text-text-1 font-mono text-xs whitespace-nowrap">
                          {fmtDate(b.appointmentDate)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold font-mono whitespace-nowrap">
                          {fmt$(b.totalCost)}
                        </td>
                        <td className="px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap hidden md:table-cell">
                          {b.discount > 0 ? `${((b.discount / b.totalCost) * 100).toFixed(2)}%` : '0.00%'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap hidden lg:table-cell">
                          {fmt$(totalDescontado)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                          <span className={b.amountPaid > 0 ? 'text-emerald font-semibold' : 'text-text-muted'}>
                            {fmt$(b.amountPaid)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                          <span className={b.balanceDue > 0 ? 'text-rose font-semibold' : 'text-emerald'}>
                            {fmt$(b.balanceDue)}
                          </span>
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="p-1 rounded text-text-muted hover:text-cyan transition-colors"
                              title="Notas de cita"
                            >
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
                              <div className="py-3 text-text-muted text-xs italic">
                                No hay detalles sobre los pagos
                              </div>
                            ) : (
                              <table className="w-full text-xs my-2">
                                <thead>
                                  <tr className="text-text-muted">
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">Fecha de pago</th>
                                    <th className="text-right py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">Cantidad</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Método</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Pagado por</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden md:table-cell">Estado</th>
                                    <th className="w-8" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                  {b.payments.map(p => (
                                    <tr key={p.id} className={p.status === 'CANCELLED' ? 'opacity-40 line-through' : ''}>
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
                                          p.status === 'CANCELLED' ? 'bg-rose/10 text-rose' :
                                          'bg-amber/10 text-amber'
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
                                            title="Cancelar pago"
                                          >
                                            {deletingPay === p.id
                                              ? <Loader2 className="w-3 h-3 animate-spin" />
                                              : <Trash2 className="w-3 h-3" />
                                            }
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
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Pagar deuda ─────────────────────────────────────────────────── */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
          <div
            className="bg-bg-1 border border-border rounded-xl w-full max-w-3xl my-8 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-text-1 font-semibold text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber" /> Pago del caso
                </h2>
                <p className="text-text-muted text-xs mt-0.5">Complete el pago para el caso seleccionado abajo.</p>
              </div>
              <button onClick={() => setPayOpen(false)} className="text-text-muted hover:text-text-1 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-2 border-b border-border">
              <div className="px-5 py-3 border-r border-border">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Total pendiente</div>
                <div className="text-xl font-bold font-mono text-rose mt-0.5">{fmt$(totalPending)}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Citas pendientes</div>
                <div className="text-xl font-bold font-mono text-text-1 mt-0.5">{pending.length}</div>
              </div>
            </div>

            {/* Distribution table */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-2/90 backdrop-blur-sm border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Fecha</th>
                    <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Costo</th>
                    <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">Descuento %</th>
                    <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">Monto desc.</th>
                    <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pagado</th>
                    <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Pendiente</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted w-28">Pagar</th>
                    <th className="px-3 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {pending.map(b => {
                    const discPct = b.totalCost > 0 ? ((b.discount / b.totalCost) * 100).toFixed(2) : '0.00';
                    return (
                      <tr key={b.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-text-1 font-mono text-xs whitespace-nowrap">{fmtDate(b.appointmentDate)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">{fmt$(b.totalCost)}</td>
                        <td className="px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap hidden md:table-cell">{discPct}%</td>
                        <td className="px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap hidden md:table-cell">{fmt$(b.discount)}</td>
                        <td className="px-3 py-3 text-right text-emerald font-mono text-xs whitespace-nowrap">{fmt$(b.amountPaid)}</td>
                        <td className="px-3 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold">
                            {fmt$(b.balanceDue)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            max={b.balanceDue}
                            step="0.01"
                            value={payAmounts[b.id] ?? ''}
                            onChange={e => setPayAmounts(prev => ({ ...prev, [b.id]: e.target.value }))}
                            className="w-full rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 font-mono text-right outline-none focus:border-brand"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setPayAmounts(prev => ({ ...prev, [b.id]: b.balanceDue.toFixed(2) }))}
                            className="text-[10px] text-brand hover:text-brand/70 transition-colors font-semibold"
                            title="Pagar total pendiente"
                          >
                            MAX
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Auto-distribute */}
            <div className="px-5 py-3 border-t border-border/60 bg-bg-2/30">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>Distribución automática:</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Monto total…"
                  onChange={e => autoDistribute(e.target.value)}
                  className="w-36 rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 font-mono outline-none focus:border-brand"
                />
                <span className="text-text-muted">→ se distribuye del más reciente al más antiguo</span>
              </div>
            </div>

            {/* Register payment section */}
            <div className="px-5 py-4 border-t border-border space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Registrar pago</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {/* Source */}
                <select
                  value={paySource}
                  onChange={e => {
                    const src = e.target.value as typeof paySource;
                    setPaySource(src);
                    setPayType(PAYMENT_TYPES[src]?.[0]?.value ?? '');
                  }}
                  className="rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
                >
                  <option value="INSURANCE">Seguro</option>
                  <option value="PATIENT">Paciente</option>
                  <option value="LAWYER">Abogado</option>
                </select>

                {/* Method */}
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
                >
                  <option value="CHECK">Cheque</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="NONE">— Sin especificar</option>
                </select>

                {/* Payment type */}
                <select
                  value={payType}
                  onChange={e => setPayType(e.target.value)}
                  className="rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand sm:col-span-2 md:col-span-1"
                >
                  {(PAYMENT_TYPES[paySource] ?? []).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {/* Total to pay (display only) */}
                <div className="rounded-md bg-bg-2 border border-border px-3 py-2 flex items-center justify-between">
                  <span className="text-text-muted text-xs">Total:</span>
                  <span className="font-mono font-bold text-sm text-emerald">{fmt$(payTotal)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPayOpen(false)} disabled={paying} className="sm:w-auto w-full">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={submitPayment}
                disabled={paying || payTotal <= 0}
                className="sm:w-auto w-full gap-1.5 bg-amber hover:bg-amber/90 text-black border-0"
              >
                {paying
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando…</>
                  : <><CreditCard className="w-3.5 h-3.5" /> + Pagar {payTotal > 0 ? fmt$(payTotal) : '…'}</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
