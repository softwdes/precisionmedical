'use client';
import { localeApp } from '@/lib/fechas';

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
  /** PATIENT = se cobra en caja · INSURANCE = lo cobra Cobranzas después */
  payer: 'PATIENT' | 'INSURANCE';
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

/** Un pago ya registrado, plano — el historial que ve el mostrador. */
interface PaymentRow {
  id: string;
  billingId: string;
  amount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE';
  paymentType: string | null;
  insuranceCarrier: { id: string; name: string } | null;
  notes: string | null;
  paidAt: string;
  appointmentId: string | null;
  appointmentDate: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
}

interface CaseInsurance { id: string; name: string; label: string }
/**
 * `patientBalance` / `insuranceBalance` — el saldo NO es uno solo: lo del
 * paciente se cobra en el momento, lo del seguro/abogado lo gestiona el
 * encargado después y puede tardar meses (regla de Erick 2026-08-08).
 */
interface Kpis {
  totalCost: number; totalPaid: number; totalBalance: number;
  patientBalance: number; insuranceBalance: number;
  /** Lo cobrado, por quién lo puso — un copago es plata del paciente sobre una
   *  línea que se le factura al seguro, y sin esto no se distinguía. */
  paidByPatient: number; paidByInsurance: number;
}
const EMPTY_KPIS: Kpis = {
  totalCost: 0, totalPaid: 0, totalBalance: 0, patientBalance: 0, insuranceBalance: 0,
  paidByPatient: 0, paidByInsurance: 0,
};

// ─── Payment type options (igual a v2) ─────────────────────────────────────────

/**
 * Los rotulos salen de i18n, no de constantes de modulo.
 *
 * Estaban clavados en espanol: con la app en ingles, la pantalla donde se COBRA
 * mostraba "Copago (Cp)" y "Cheque". Los CODIGOS entre parentesis se mantienen
 * en las dos traducciones — son la nomenclatura de facturacion que usa el equipo
 * (Cp, CO, TF, Red AG) y no se traducen.
 */
type Traducir = (clave: string) => string;

const tiposDePago = (t: Traducir): Record<string, { label: string; value: string }[]> => ({
  INSURANCE: [
    { label: t('ptDirectInsurance'), value: 'direct_insurance' },
    { label: t('ptContractual'),     value: 'contractual_obligation' },
    { label: t('ptLateFiling'),      value: 'late_filing_penalty' },
  ],
  LAWYER: [
    { label: t('ptAttorney'),  value: 'attorney_payment' },
    { label: t('ptReduction'), value: 'reduction_agreement' },
  ],
  PATIENT: [
    { label: t('ptCopay'),       value: 'copay' },
    { label: t('ptDeductible'),  value: 'deductible' },
    { label: t('ptCoinsurance'), value: 'coinsurance' },
    { label: t('ptSelfPay'),     value: 'patient_direct' },
    { label: t('ptCourtesy'),    value: 'professional_courtesy' },
    { label: t('ptCollections'), value: 'external_collections' },
  ],
});

const metodos = (t: Traducir): Record<string, string> => ({
  CHECK: t('mCheck'), CARD: t('mCard'), CASH: t('mCash'), TRANSFER: t('mTransfer'), NONE: '—',
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric' });
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
          {selected?.label ?? placeholder}
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
                  ? 'bg-brand/10 text-brand-text'
                  : 'text-text-1 hover:bg-bg-2'
              }`}
            >
              {opt.label}
              {opt.value === value && <span className="text-brand-text text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, hint }: {
  label: string; value: number; color: string;
  /** Segunda línea — el desglose de la cifra grande, cuando la cifra sola no alcanza */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4 flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{fmt$(value)}</div>
      {hint && <div className="text-[11px] text-text-muted mt-1 truncate">{hint}</div>}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export interface FinanzasTabHandle { openPayModal: () => void; reload: () => void; reloadAndOpen: () => void }

/**
 * `readOnly` — vista del doctor: ve el summary completo (costos, pagado, saldo,
 * detalle por línea) pero SIN acciones de cobro. El cobro es del asistente —
 * misma regla que `hidePayments` en el panel de servicios.
 */
export const FinanzasTab = forwardRef<FinanzasTabHandle, { caseId: string; filterAppointmentId?: string; readOnly?: boolean }>(function FinanzasTab({ caseId, filterAppointmentId, readOnly = false }, ref) {
  const t  = useTranslations('phoenix.caseTabs.finanzas');
  const tc = useTranslations('phoenix.common');
  // Claves del CTA "Cobrar $X" — las mismas del Resumen (una sola voz)
  const tDoc = useTranslations('phoenix.doctor');
  const [billings, setBillings]     = useState<BillingRecord[]>([]);
  const [kpis, setKpis]             = useState<Kpis>(EMPTY_KPIS);
  const [payments, setPayments]     = useState<PaymentRow[]>([]);
  /** Rotulos traducidos — memo para no rearmar las listas en cada render. */
  const PAYMENT_TYPES  = React.useMemo(() => tiposDePago(t), [t]);
  const METHOD_LABELS  = React.useMemo(() => metodos(t), [t]);
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
  /** Visita con el detalle desplegado en el modal de cobro */
  const [detalleVisita, setDetalleVisita] = useState<string | null>(null);
  const [noteDialogFor, setNoteDialogFor] = useState<string | null>(null); // billingId de la fila con "Nota de pago" abierta
  const [noteDraft, setNoteDraft]         = useState('');
  const openAfterLoad = useRef(false);

  /**
   * Lo que se puede cobrar en el mostrador.
   *
   * `payer === 'PATIENT'` NO es un detalle: sin ese filtro el modal listaba las
   * líneas de CPT —lo que se le factura al seguro o al abogado meses después—
   * junto a labs, férulas y efectivo, todas cobrables al paciente. En un caso de
   * prueba eran $744 del seguro ofrecidos para cobrar en caja.
   *
   * Y si viene de una cita puntual (calendario), solo esa visita.
   */
  const pendingOf = useCallback((list: BillingRecord[]) => (
    list.filter(b =>
      b.payer === 'PATIENT'
      && b.balanceDue > 0
      && (!filterAppointmentId || b.appointmentId === filterAppointmentId))
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
      setKpis({ ...EMPTY_KPIS, ...(data.kpis ?? {}) });
      setPayments(data.payments ?? []);
      setInsurances(freshInsurances);

      // Open pay modal with fresh data if flagged
      if (openAfterLoad.current) {
        openAfterLoad.current = false;
        const pending = pendingOf(freshBillings);
        const init: Record<string, string> = {};
        // Claves por visita: el monto se escribe una vez por consulta
        pending.forEach(b => { init[b.appointmentId ?? `sin-cita-${b.id}`] = ''; });
        setPayAmounts(init);
        setPayNotes({});
        setPaySource('PATIENT');
        setPayMethod('CHECK');
        setPayType(PAYMENT_TYPES['PATIENT'][0].value);
        setPayInsuranceId(freshInsurances[0]?.id ?? '');
        setPayOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [caseId, pendingOf]);

  useEffect(() => { load(); }, [load]);

  function openPayModal() {
    if (readOnly) return; // el doctor no cobra — gate también acá porque el handle es imperativo
    const pending = pendingOf(billings);
    const init: Record<string, string> = {};
    pending.forEach(b => { init[b.appointmentId ?? `sin-cita-${b.id}`] = ''; });
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
    const claves = (lista: BillingRecord[]) =>
      [...new Set(lista.map(b => b.appointmentId ?? `sin-cita-${b.id}`))];

    if (isNaN(raw) || raw <= 0) {
      const pend = pendingOf(billings);
      setPayAmounts(prev => { const n = { ...prev }; claves(pend).forEach(k => { n[k] = ''; }); return n; });
      return;
    }
    // Reparte el total entre las VISITAS, de la más reciente a la más vieja:
    // lo que se cobra hoy suele ser lo de hoy.
    const total = Math.min(raw, totalPending);
    const newAmounts: Record<string, string> = {};
    let remaining = total;
    for (const v of visitasPendientes) {
      if (remaining <= 0) { newAmounts[v.key] = ''; continue; }
      const apply = Math.min(remaining, v.saldo);
      newAmounts[v.key] = apply.toFixed(2);
      remaining -= apply;
    }
    setPayAmounts(prev => ({ ...prev, ...newAmounts }));
  }

  async function submitPayment() {
    /**
     * Se escribe un monto por VISITA y se guarda una fila por LÍNEA: la base
     * mantiene la verdad por servicio (es lo que después se concilia con el
     * seguro y lo que permite anular un pago puntual), y el mostrador escribe
     * una sola cifra. La nota va en todas las líneas de esa visita: es un mismo
     * cobro repartido, y cada parte tiene que poder explicarse sola.
     */
    const entries = visitasPendientes.flatMap(v => {
      const monto = parseFloat(payAmounts[v.key] ?? '0') || 0;
      if (monto <= 0) return [];
      return Object.entries(repartir(v.lineas, monto)).map(([billingId, amount]) => ({
        billingId, amount, notes: payNotes[v.key] || null,
      }));
    });

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
    if (!confirm(t('payConfirmCancel'))) return;
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

  /**
   * Los KPIs y el historial se derivan acá, no se toman de la API.
   *
   * Dos razones. Los de la API son de TODO el caso: con el selector de visita
   * puesto, la tabla mostraba una cita y las cifras seguían siendo del caso
   * entero — números que no cuadran con lo que se está viendo. Y son del caso
   * completo incluyendo CPT, que en Finanzas no va: eso lo cobra Cobranzas al
   * seguro o al abogado meses después.
   */
  const deLaVista   = billings.filter(b =>
    b.payer === 'PATIENT' && (!filterAppointmentId || b.appointmentId === filterAppointmentId));
  const vistaCosto  = deLaVista.reduce((s, b) => s + b.totalCost, 0);
  const vistaPagado = deLaVista.reduce((s, b) => s + b.amountPaid, 0);
  const vistaSaldo  = deLaVista.reduce((s, b) => s + b.balanceDue, 0);

  /** Historial: pagos del paciente, del período visible. Sin anulados — los
   *  filtra la API, y la anulación queda en el AuditLog. */
  const historial = payments.filter(p =>
    p.source === 'PATIENT' && (!filterAppointmentId || p.appointmentId === filterAppointmentId));

  const pending     = pendingOf(billings);
  const totalPending = pending.reduce((s, b) => s + b.balanceDue, 0);

  /**
   * Lo pendiente agrupado POR VISITA. El paciente paga "lo del 5 de agosto":
   * servicios, férulas y labs de esa consulta van juntos y el monto se escribe
   * una sola vez (decisión de Erick 2026-08-10). Antes había un campo por línea
   * y en una visita con 6 cargos eran 6 campos para un solo cobro.
   */
  const visitasPendientes = React.useMemo(() => {
    const m = new Map<string, { key: string; fecha: string | null; lineas: BillingRecord[]; saldo: number }>();
    for (const b of pending) {
      const key = b.appointmentId ?? `sin-cita-${b.id}`;
      const g = m.get(key) ?? { key, fecha: b.appointmentDate, lineas: [], saldo: 0 };
      g.lineas.push(b);
      g.saldo += b.balanceDue;
      m.set(key, g);
    }
    return [...m.values()].sort((a, z) =>
      new Date(z.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime());
  }, [pending]);

  /**
   * Con UNA sola visita pendiente, el detalle se abre solo.
   *
   * La fila por visita existe para el caso, donde hay muchas fechas y se elige
   * cuál cobrar. Abierto desde una cita hay una sola, así que esa fila colapsada
   * no agrupa nada: solo esconde lo único que se vino a ver, y obliga a un clic
   * para llegar a los cargos (Erick, 2026-08-13: "aquí necesita mostrar de frente
   * la lista de pagos").
   */
  React.useEffect(() => {
    if (!payOpen) return;
    if (visitasPendientes.length === 1) setDetalleVisita(visitasPendientes[0]!.key);
  }, [payOpen, visitasPendientes]);

  /**
   * Cómo se reparte el monto de una visita entre sus líneas: en ORDEN, llenando
   * cada una hasta agotar la plata.
   *
   * Se descartó repartir en proporción porque nadie puede explicar en el
   * mostrador por qué el lab quedó en $37.42. Así se lee de corrido: "el lab
   * pagado, la férula a medias, el resto sin tocar". Y el reparto se muestra en
   * el detalle mientras se escribe, así que no es una regla oculta.
   */
  const repartir = useCallback((lineas: BillingRecord[], monto: number): Record<string, number> => {
    let resto = monto;
    const out: Record<string, number> = {};
    for (const l of lineas) {
      if (resto <= 0) break;
      const toma = Math.min(resto, l.balanceDue);
      out[l.id] = Math.round(toma * 100) / 100;
      resto -= toma;
    }
    return out;
  }, []);
  const payTotal    = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const hasOverpay  = visitasPendientes.some(v => (parseFloat(payAmounts[v.key] ?? '0') || 0) > v.saldo);

  // Options for custom selects
  const sourceOptions: SelectOption[] = [
    { label: t('srcPatient'), value: 'PATIENT' },
    { label: t('srcInsurance'), value: 'INSURANCE' },
    { label: t('srcLawyer'), value: 'LAWYER' },
  ];
  const methodOptions: SelectOption[] = [
    { label: t('mCheck'),    value: 'CHECK' },
    { label: t('mCard'),     value: 'CARD' },
    { label: t('mCash'),     value: 'CASH' },
    { label: t('mTransfer'), value: 'TRANSFER' },
    { label: `— ${t('notSpecified')}`, value: 'NONE' },
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
          {/* Cobrar — acción principal del tab, en la esquina donde vive la
              acción principal de todos los demás (Add charge, Dispense brace,
              New order). Dice el monto antes del clic. Verde sólido: la plata
              del paciente ya es verde en todo el sistema y el ámbar acá se
              leería como alerta. Oculto en readOnly (doctor). */}
          {vistaSaldo > 0 && !readOnly && (
            <Button size="sm" onClick={openPayModal} className="gap-1.5 bg-emerald hover:bg-emerald/90 text-bg-0 border-transparent">
              <CreditCard className="w-3.5 h-3.5" />
              {tDoc('sumCollect', { amount: fmt$(vistaSaldo) })}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        {/* Tres tarjetas, todas del PACIENTE. La de "A seguro / abogado" se fue:
            ese circuito no se cobra acá — se anota y lo gestiona Cobranzas meses
            después (regla de Erick 2026-08-10). Verlo en la pantalla de cobro
            terminaba con el mostrador pidiéndole al paciente plata del seguro. */}
        <KpiCard label={t('kpiTotalCost')} value={vistaCosto}  color="text-text-1" />
        <KpiCard label={t('kpiTotalPaid')} value={vistaPagado} color="text-emerald" />
        <KpiCard label={t('kpiPatientDebt')} value={vistaSaldo} color={vistaSaldo > 0 ? 'text-rose' : 'text-text-1'} />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">{error}</div>
      ) : historial.length === 0 ? (
        <EmptyState.Rich
          icon={DollarSign}
          title={t('historyEmptyTitle')}
          subtitle={t('historyEmptySubtitle')}
        />
      ) : (
        /**
         * HISTORIAL DE PAGOS — una fila por pago, no por servicio.
         *
         * Antes esto era "Detalle por servicio": repetía lo que ya vive en
         * Servicios, Férulas y Labs, y el historial quedaba ESCONDIDO adentro de
         * cada fila. Para saber "cuándo pagó y cuánto" había que expandir doce
         * servicios y sumar a mano. Lo que se DEBE vive en el modal de cobro,
         * agrupado por visita: el tab es el registro, el modal es la acción.
         */
        <div className="rounded-lg bg-bg-1 overflow-hidden">
          <div className="px-4 py-2 bg-bg-2/60 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {t('historyTitle')}
            </span>
            <span className="text-[10px] text-text-muted">
              {t('historyCount', { count: historial.length })}
            </span>
            <span className="ml-auto text-[11px] text-text-muted">
              {t('historyTotal')} <b className="text-emerald text-[12.5px] ml-0.5 tabular-nums">{fmt$(vistaPagado)}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-row-sep bg-bg-2/40 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  <th className="text-left px-3 py-2.5">{t('colPaidAt')}</th>
                  <th className="text-right px-3 py-2.5">{t('colAmount')}</th>
                  <th className="text-left px-3 py-2.5">{t('colMethod')}</th>
                  <th className="text-left px-3 py-2.5 hidden md:table-cell">{t('colType')}</th>
                  <th className="text-left px-3 py-2.5">{t('colAppliedTo')}</th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {historial.map(p => (
                  <tr key={p.id} className="border-b border-row-sep hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs text-text-1">
                      {fmtDate(p.paidAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs font-semibold text-emerald">
                      {fmt$(p.amount)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-text-2">
                      {METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted hidden md:table-cell">
                      {PAYMENT_TYPES[p.source]?.find(o => o.value === p.paymentType)?.label ?? '—'}
                    </td>
                    {/* A qué se aplicó: el servicio Y la visita. Un monto suelto
                        con su fecha de cobro no dice qué se estaba pagando. */}
                    <td className="px-3 py-2.5 text-xs min-w-[200px]">
                      <div className="text-text-2 truncate">
                        {p.serviceDescription ?? p.serviceCode ?? '—'}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {t('historyVisitOf')} {fmtDate(p.appointmentDate)}
                      </div>
                      {p.notes && <div className="text-[10px] italic text-text-muted mt-0.5">{p.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {!readOnly && (
                        <button
                          onClick={() => deletePayment(p.billingId, p.id)}
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
      <Dialog open={payOpen && !readOnly} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="px-5 py-4 border-b border-border shrink-0">
              <DialogTitle className="text-text-1 font-semibold text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber" /> {t('payModalTitle')}
              </DialogTitle>
              <p className="text-text-muted text-xs mt-0.5">{t('payModalSubtitle')}</p>
            </div>

            {/* Zona scrolleable — si la ventana es baja, el contenido scrollea
                en vez de quedar recortado por el max-h del dialogo. El footer
                de "Registrar pago" queda siempre visible abajo. */}
            <div className="flex-1 min-h-0 overflow-y-auto">

            {/* Summary bar */}
            <div className="grid grid-cols-2 border-b border-border">
              <div className="px-5 py-3 border-r border-border">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payTotalPending')}</div>
                <div className="text-xl font-bold font-mono text-rose mt-0.5">{fmt$(totalPending)}</div>
              </div>
              <div className="px-5 py-3">
                {/* Visitas, no líneas: se cobra por visita, así que contar
                    cargos sueltos daba un número que no se corresponde con
                    cuántos montos hay que escribir. */}
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payVisitsPending')}</div>
                <div className="text-xl font-bold font-mono text-text-1 mt-0.5">{visitasPendientes.length}</div>
              </div>
            </div>

            {/* Lo pendiente, agrupado por visita */}
            {(() => {
              // Cada piso sale del ancho real de su header (10px uppercase +
              // tracking + px-3), con holgura. Ojo con la ultima columna: es la
              // unica de ancho FIJO, asi que es la unica que puede desbordar --
              // las demas son fr y se expanden por encima de su piso. Con 44px
              // el texto "NOTAS" (~62px con padding) se salia, y ese desborde
              // alimentaba el area scrolleable del overflow-x-auto: de ahi la
              // barra horizontal que no se iba. Suman ~828px contra los 896px
              // del max-w-4xl, ~68px de holgura.
              return (
                /**
                 * UNA FILA POR VISITA, no por servicio.
                 *
                 * El paciente paga "lo del 5 de agosto": servicios, férulas y
                 * labs de esa consulta se cobran juntos, así que el monto se
                 * escribe una sola vez. Antes había un campo por línea y una
                 * visita con seis cargos eran seis campos para un solo cobro.
                 *
                 * El detalle se despliega y muestra CUÁNTO toma cada línea con
                 * el monto que se está escribiendo: el reparto va en orden hasta
                 * agotar la plata, y verlo en vivo es lo que evita que sea una
                 * regla oculta.
                 */
                <div className="max-h-72 overflow-y-auto divide-y divide-row-sep">
                  {visitasPendientes.map(v => {
                    const monto = parseFloat(payAmounts[v.key] ?? '0') || 0;
                    const reparto = repartir(v.lineas, monto);
                    const abierta = detalleVisita === v.key;
                    return (
                      <div key={v.key}>
                        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setDetalleVisita(abierta ? null : v.key)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            {abierta
                              ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                            <span className="text-[13px] font-semibold text-text-1 whitespace-nowrap">
                              {fmtDate(v.fecha)}
                            </span>
                            <span className="text-[11px] text-text-muted">
                              {t('payVisitLines', { count: v.lineas.length })}
                            </span>
                            {/* Pago parcial, a la vista sin desplegar: "a veces no
                                pagan todo" es el caso normal, y saber cuánto queda
                                es lo que se le dice al paciente antes de que se
                                vaya. El reparto por servicio está en el detalle. */}
                            {monto > 0 && monto < v.saldo && (
                              <span className="text-[11px] text-amber whitespace-nowrap">
                                {t('payLeftOver', { amount: fmt$(v.saldo - monto) })}
                              </span>
                            )}
                            {monto > 0 && monto >= v.saldo && (
                              <span className="text-[11px] text-emerald whitespace-nowrap">
                                {t('payFullVisit')}
                              </span>
                            )}
                          </button>

                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold whitespace-nowrap shrink-0">
                            {fmt$(v.saldo)}
                          </span>

                          <input
                            type="number"
                            min="0"
                            max={v.saldo}
                            step="0.01"
                            value={payAmounts[v.key] ?? ''}
                            /**
                             * Tope al ESCRIBIR, no al salir del campo: si tecleás
                             * 500 sobre una visita de $125, el campo se queda en
                             * 125. Es como funcionaba el "Distribuir hasta $X" de
                             * siempre — dejarlo pasar y corregir al blur hacía
                             * dudar de si el monto había entrado o no.
                             */
                            onChange={e => {
                              const raw = parseFloat(e.target.value);
                              const val = !isNaN(raw) && raw > v.saldo ? v.saldo.toFixed(2) : e.target.value;
                              setPayAmounts(prev => ({ ...prev, [v.key]: val }));
                            }}
                            onBlur={e => {
                              const raw = parseFloat(e.target.value);
                              if (!isNaN(raw)) {
                                const clamped = Math.min(Math.max(0, raw), v.saldo);
                                setPayAmounts(prev => ({ ...prev, [v.key]: clamped.toFixed(2) }));
                              }
                            }}
                            placeholder="0.00"
                            aria-label={`${t('payColPay')} ${fmtDate(v.fecha)}`}
                            className="w-[110px] shrink-0 rounded-md bg-bg-2 px-2 py-1 text-xs font-mono text-right text-text-1 outline-none focus:ring-1 focus:ring-brand/40 transition-colors"
                          />

                          {/* Atajo: cobrar toda la visita sin escribir el monto */}
                          <button
                            type="button"
                            onClick={() => setPayAmounts(prev => ({ ...prev, [v.key]: v.saldo.toFixed(2) }))}
                            className="text-[11px] font-semibold text-brand-text hover:underline shrink-0"
                          >
                            {t('payAllVisit')}
                          </button>

                          <button
                            type="button"
                            disabled={monto <= 0}
                            onClick={() => { setNoteDraft(payNotes[v.key] ?? ''); setNoteDialogFor(v.key); }}
                            className={`p-1 rounded shrink-0 transition-colors hover:text-cyan disabled:opacity-30 ${
                              payNotes[v.key] ? 'text-cyan' : 'text-text-muted'
                            }`}
                            title={t('payNoteTooltip')}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {abierta && (
                          <div className="px-4 pb-3 pt-0 bg-bg-2/30">
                            <table className="w-full text-[11.5px]">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                                  <th className="text-left py-1.5">{t('payColService')}</th>
                                  <th className="text-right py-1.5">{t('payColPending')}</th>
                                  <th className="text-right py-1.5">{t('payColTakes')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {v.lineas.map(l => (
                                  <tr key={l.id} className="text-text-2">
                                    <td className="py-1 pr-2">
                                      {l.serviceCode && <span className="font-mono text-cyan mr-1.5">{l.serviceCode}</span>}
                                      {l.serviceDescription ?? '—'}
                                    </td>
                                    <td className="py-1 text-right font-mono tabular-nums">{fmt$(l.balanceDue)}</td>
                                    <td className={`py-1 text-right font-mono tabular-nums ${reparto[l.id] ? 'text-emerald' : 'text-text-muted'}`}>
                                      {reparto[l.id] ? fmt$(reparto[l.id]) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            </div>{/* /zona scrolleable */}

            {/* Registrar pago — footer */}
            <div className="shrink-0 px-5 py-4 border-t border-border bg-bg-2/30 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payRegister')}</div>

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
                    options={insuranceOptions.length ? insuranceOptions : [{ label: t('noInsurances'), value: '' }]}
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
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payProcessing')}</>
                    : <>+ Pagar{payTotal > 0 ? ` ${fmt$(payTotal)}` : '…'}</>
                  }
                </Button>
              </div>
            </div>

            {/* Nota de pago — overlay dentro del modal (no un segundo fixed
                encima, para no repetir el problema de dos fondos oscuros
                apilados que ya tuvimos con Servicios + Pagar deuda). */}
            {noteDialogFor && (() => {
              // `noteDialogFor` es la clave de la VISITA (antes era un billingId):
              // la nota describe el cobro completo, que ahora se hace por visita.
              const v = visitasPendientes.find(x => x.key === noteDialogFor);
              if (!v) return null;
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
                        <h3 className="text-text-1 font-semibold text-base">{t('payNoteTitle')}</h3>
                        <p className="text-text-muted text-xs mt-0.5">{t('payNoteHint', { date: fmtDate(v.fecha) })}</p>
                      </div>
                      <button onClick={() => setNoteDialogFor(null)} className="text-text-muted hover:text-text-1 transition-colors p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-text-1">{t('payNotesLabel')}</label>
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
                        {t('payNoteSave')}
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
