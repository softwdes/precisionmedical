'use client';

/**
 * B.11 — AppointmentDetailPanel (modal centrado con tabs)
 *
 * Tab 1: Detalle — info cita, checklist, notas, acciones
 * Tab 2: Servicios — CPT inline typeahead, auto-save
 * Tab 3: Pagos — KPIs del caso + registrar pago inline
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Phone, MessageSquare, RefreshCw, Calendar,
  CheckCircle2, AlertTriangle, ChevronRight, ChevronDown, ChevronUp,
  User, Scale, Shield, Headphones, Check, Edit2, Ban,
  AlertCircle, Search, X, Plus, Trash2, DollarSign,
  Stethoscope, Loader2, Clock, CreditCard, FileText,
} from 'lucide-react';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { Dialog, DialogContent } from '@precision/ui';
import { AppointmentSecondaryModals, type SecondaryModalType } from './appointment-secondary-modals';
import { AppointmentDialog, type EditAppointmentData } from './appointment-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  visitNumber: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: string | null;
  };
  case: {
    id: string;
    caseCode: string;
    accidentType: string | null;
    accidentDate: string | null;
    status: string;
    intakeFormCompletedAt: string | null;
    attorney: { id: string; firmName: string | null; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
    primaryInsurance: { id: string; name: string } | null;
  } | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

interface PlannedService {
  id: string;
  code: string;
  description: string;
  fee: number;
  category: string;
}

interface BillingPayment {
  id: string;
  amount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  paymentType: string | null;
  method: string;
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

interface CaseInsurance { id: string; name: string; label: string }

// ─── Payment constants ────────────────────────────────────────────────────────

const PAYMENT_TYPE_KEYS: Record<string, { tKey: string; value: string }[]> = {
  INSURANCE: [
    { tKey: 'paymentTypeDirectInsurance',         value: 'direct_insurance' },
    { tKey: 'paymentTypeContractualObligation',   value: 'contractual_obligation' },
    { tKey: 'paymentTypeLateFilingPenalty',       value: 'late_filing_penalty' },
  ],
  LAWYER: [
    { tKey: 'paymentTypeAttorneyPayment',   value: 'attorney_payment' },
    { tKey: 'paymentTypeReductionAgreement', value: 'reduction_agreement' },
  ],
  PATIENT: [
    { tKey: 'paymentTypeCopay',                 value: 'copay' },
    { tKey: 'paymentTypeDeductible',            value: 'deductible' },
    { tKey: 'paymentTypeCoinsurance',           value: 'coinsurance' },
    { tKey: 'paymentTypePatientDirect',         value: 'patient_direct' },
    { tKey: 'paymentTypeProfessionalCourtesy',  value: 'professional_courtesy' },
    { tKey: 'paymentTypeExternalCollections',   value: 'external_collections' },
  ],
};

const METHOD_TKEYS: Record<string, string> = {
  CHECK: 'methodCheck', CARD: 'methodCard', CASH: 'methodCash', TRANSFER: 'methodTransfer', NONE: 'methodNone',
};

const SOURCE_TKEYS: Record<string, string> = {
  INSURANCE: 'sourceInsurance', PATIENT: 'sourcePatient', LAWYER: 'sourceLawyer',
};

// ─── SelectUp ────────────────────────────────────────────────────────────────

interface SelectOption { label: string; value: string }

function SelectUp({ value, onChange, options, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void;
  options: SelectOption[]; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none hover:border-brand/60 transition-colors">
        <span className={selected ? 'text-text-1' : 'text-text-muted'}>{selected?.label ?? placeholder ?? '—'}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-bg-1 border border-border rounded-md shadow-xl overflow-hidden">
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${opt.value === value ? 'bg-brand/10 text-brand' : 'text-text-1 hover:bg-bg-2'}`}>
              {opt.label}
              {opt.value === value && <span className="text-brand text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  appointment: CalendarAppointment;
  onClose: () => void;
  onRefresh: () => void;
  initialTab?: Tab;
  inline?: boolean;
}

type Tab = 'detail' | 'services' | 'payments';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: `${MONTHS_ES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
    time: d.toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    dayName: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()],
    dateInput: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    timeInput: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
  };
}

function ageFromISO(iso: string | null): string {
  if (!iso) return '?';
  const dob  = new Date(iso);
  const diff = Date.now() - dob.getTime();
  return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

const TYPE_LABEL: Record<string, string> = {
  AUTO_ACCIDENT:   'MVA · Auto Accident',
  FAMILY_PRACTICE: 'Family Practice',
  URGENT_CARE:     'Urgent Care',
  FOLLOW_UP:       'Follow-up',
  CONSULTATION:    'Consultation',
};

const SPECIALTY_LABEL: Record<string, string> = {
  CHIROPRACTIC:     'Chiropractic',
  PHYSICAL_THERAPY: 'Physical Therapy',
  PAIN_MANAGEMENT:  'Pain Management',
  ORTHOPEDICS:      'Orthopedics',
  NEUROLOGY:        'Neurology',
  RADIOLOGY:        'Radiology',
  PSYCHOLOGY:       'Psychology',
  GENERAL:          'General',
  OTHER:            'Other',
};

const STATUS_CONFIG: Record<string, { tKey: string; state: StatusState }> = {
  SCHEDULED:   { tKey: 'statusScheduled',   state: 'info'    },
  CONFIRMED:   { tKey: 'statusConfirmed',   state: 'success' },
  IN_PROGRESS: { tKey: 'statusInProgress',  state: 'active'  },
  COMPLETED:   { tKey: 'statusCompleted',   state: 'success' },
  PENDING:     { tKey: 'statusPending',     state: 'warning' },
  NO_SHOW:     { tKey: 'statusNoShow',      state: 'danger'  },
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// ─── Componente principal ─────────────────────────────────────────────────────

export function AppointmentDetailPanel({ appointment: appt, onClose, onRefresh, initialTab = 'detail', inline = false }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.calendar');

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // ── Detail tab ────────────────────────────────────────────────────────────
  const [activeModal,   setActiveModal]   = useState<SecondaryModalType | null>(null);
  const [confirming,    setConfirming]    = useState(false);
  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelError,   setCancelError]   = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [editOpen,       setEditOpen]       = useState(false);

  // ── Services tab ──────────────────────────────────────────────────────────
  const [services,       setServices]       = useState<PlannedService[]>([]);
  const [svcLoaded,      setSvcLoaded]      = useState(false);
  const [serviceSearch,  setServiceSearch]  = useState('');
  const [serviceResults, setServiceResults] = useState<PlannedService[]>([]);
  const [searchingSvc,   setSearchingSvc]   = useState(false);
  const [savingSvc,      setSavingSvc]      = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);

  // ── Payments tab ──────────────────────────────────────────────────────────
  const [billings,       setBillings]       = useState<BillingRecord[]>([]);
  const [billKpis,       setBillKpis]       = useState<{ totalCost: number; totalPaid: number; totalBalance: number }>({ totalCost: 0, totalPaid: 0, totalBalance: 0 });
  const [insurances,     setInsurances]     = useState<CaseInsurance[]>([]);
  const [loadingBill,    setLoadingBill]    = useState(false);
  const [billLoaded,     setBillLoaded]     = useState(false);
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set());
  // Modal
  const [payOpen,        setPayOpen]        = useState(false);
  const [payAmounts,     setPayAmounts]     = useState<Record<string, string>>({});
  const [payNotes,       setPayNotes]       = useState<Record<string, string>>({});
  const [paySource,      setPaySource]      = useState<'INSURANCE'|'PATIENT'|'LAWYER'>('PATIENT');
  const [payMethod,      setPayMethod]      = useState<string>('CHECK');
  const [payType,        setPayType]        = useState<string>('');
  const [payInsuranceId, setPayInsuranceId] = useState<string>('');
  const [paying,         setPaying]         = useState(false);
  const [deletingPay,    setDeletingPay]    = useState<string | null>(null);

  const isFirst   = appt.visitNumber === 0;
  const dt        = formatDateTime(appt.scheduledFor);
  const statusCfgRaw = STATUS_CONFIG[appt.status];
  const statusCfg = { label: statusCfgRaw ? t(statusCfgRaw.tKey as Parameters<typeof t>[0]) : appt.status, state: (statusCfgRaw?.state ?? 'info') as StatusState };
  const intakeDone    = !!appt.case?.intakeFormCompletedAt;
  const lawyerDone    = !!appt.case?.attorney;
  const insuranceDone = !!appt.case?.primaryInsurance;

  // ── Load services when tab opens ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'services' || svcLoaded) return;
    fetch(`/api/admin/appointments/${appt.id}`)
      .then(r => r.json())
      .then(d => {
        setServices((d.plannedServiceCodes as PlannedService[]) ?? []);
        setSvcLoaded(true);
      })
      .catch(() => setSvcLoaded(true));
  }, [activeTab, appt.id, svcLoaded]);

  // ── Load billing when tab opens ───────────────────────────────────────────
  const loadBilling = useCallback(async () => {
    if (!appt.case?.id) return;
    setLoadingBill(true);
    try {
      const res = await fetch(`/api/admin/cases/${appt.case.id}/billing`);
      const data = await res.json();
      setBillings(data.billings ?? []);
      setBillKpis(data.kpis ?? { totalCost: 0, totalPaid: 0, totalBalance: 0 });
      setInsurances(data.insurances ?? []);
      setBillLoaded(true);
    } catch { /* silent */ } finally {
      setLoadingBill(false);
    }
  }, [appt.case?.id]);

  useEffect(() => {
    if (activeTab !== 'payments' || billLoaded) return;
    loadBilling();
  }, [activeTab, billLoaded, loadBilling]);

  // ── Service search debounce ───────────────────────────────────────────────
  useEffect(() => {
    if (serviceSearch.length < 2) { setServiceResults([]); return; }
    const t = setTimeout(() => {
      setSearchingSvc(true);
      fetch(`/api/admin/service-codes?search=${encodeURIComponent(serviceSearch)}`)
        .then(r => r.json())
        .then(d => setServiceResults((d.codes ?? []).slice(0, 8)))
        .catch(() => {})
        .finally(() => setSearchingSvc(false));
    }, 300);
    return () => clearTimeout(t);
  }, [serviceSearch]);

  // ── Service helpers ───────────────────────────────────────────────────────
  const patchServices = useCallback(async (list: PlannedService[]) => {
    setSavingSvc(true);
    setSavedOk(false);
    try {
      await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedServiceCodes: list }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSavingSvc(false);
    }
  }, [appt.id]);

  const addService = useCallback((svc: PlannedService) => {
    if (services.find(s => s.id === svc.id)) return;
    const next = [...services, { id: svc.id, code: svc.code, description: svc.description, fee: svc.fee, category: svc.category }];
    setServices(next);
    setServiceSearch('');
    setServiceResults([]);
    patchServices(next);
  }, [services, patchServices]);

  const removeService = useCallback((id: string) => {
    const next = services.filter(s => s.id !== id);
    setServices(next);
    patchServices(next);
  }, [services, patchServices]);

  const updateServiceFee = useCallback((id: string, fee: number) => {
    const next = services.map(s => s.id === id ? { ...s, fee } : s);
    setServices(next);
    patchServices(next);
  }, [services, patchServices]);

  const svcTotal = services.reduce((s, c) => s + c.fee, 0);

  // ── Detail handlers ───────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await fetch(`/api/admin/appointments/${appt.id}/confirm`, { method: 'POST' });
      onRefresh(); onClose();
    } finally { setConfirming(false); }
  };

  const handleCancel = async () => {
    setCancelError(null); setCancelling(true);
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
      router.refresh(); onRefresh(); onClose();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : t('errorCancelAppointment'));
    } finally { setCancelling(false); }
  };

  // ── Payment helpers ───────────────────────────────────────────────────────
  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openPayModal() {
    const pending = billings.filter(b => b.balanceDue > 0);
    const init: Record<string, string> = {};
    pending.forEach(b => { init[b.id] = ''; });
    setPayAmounts(init);
    setPayNotes({});
    setPaySource('PATIENT');
    setPayMethod('CHECK');
    setPayType(PAYMENT_TYPE_KEYS['PATIENT'][0].value);
    setPayInsuranceId(insurances[0]?.id ?? '');
    setPayOpen(true);
  }

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

  const submitPayment = async () => {
    if (!appt.case?.id) return;
    const entries = Object.entries(payAmounts)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([billingId, v]) => ({ billingId, amount: parseFloat(v), notes: payNotes[billingId] || null }));
    if (!entries.length) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/admin/cases/${appt.case.id}/billing/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: entries,
          source: paySource, method: payMethod,
          paymentType: payType || null,
          insuranceCarrierId: paySource === 'INSURANCE' ? (payInsuranceId || null) : null,
          paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
      setPayOpen(false);
      setBillLoaded(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('errorRegisterPayment'));
    } finally { setPaying(false); }
  };

  const deletePayment = async (billingId: string, payId: string) => {
    if (!appt.case?.id) return;
    if (!confirm(t('confirmCancelPayment'))) return;
    setDeletingPay(payId);
    try {
      const res = await fetch(`/api/admin/cases/${appt.case.id}/billing/${billingId}/payments/${payId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBillLoaded(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('errorCancelPayment'));
    } finally { setDeletingPay(null); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'detail',   label: t('tabDetail'),   icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'services', label: t('tabServices'), icon: <Stethoscope className="w-3.5 h-3.5" /> },
    { id: 'payments', label: t('tabPayments'), icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  const panelContent = (
    <>

          {/* ─── Header (solo en modal, no inline) ──────────────── */}
          {!inline && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-cyan" />
                <div>
                  <div className="text-text-1 font-semibold text-sm">{dt.dayName} {dt.date}</div>
                  <div className="text-text-muted text-xs">{dt.time} · {appt.durationMinutes} min</div>
                </div>
              </div>
              <StatusPill label={statusCfg.label} state={statusCfg.state} />
            </div>
          )}

          {/* ─── Tabs (inline: solo services y payments) ─────────── */}
          <div className="flex border-b border-border shrink-0">
            {TABS.filter(tab => !inline || tab.id !== 'detail').map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-text-muted hover:text-text-2'
                }`}
              >
                {tab.icon} {tab.label}
                {tab.id === 'services' && services.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan/20 text-cyan text-[10px] font-bold leading-none">
                    {services.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ─── Tab: Detalle ────────────────────────────────────── */}
          {activeTab === 'detail' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Banner primera cita */}
              {isFirst && (
                <div className="rounded-xl border-2 border-rose/40 p-4"
                  style={{ background: 'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(244,63,94,0.07))' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">🆕</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm">{t('firstVisitBannerTitle')}</div>
                      <div className="text-text-2 text-xs mt-1 leading-relaxed">{t('firstVisitBannerSubtitle')}</div>
                    </div>
                    {appt.patient.phone && (
                      <a href={`tel:${appt.patient.phone}`}
                        className="shrink-0 px-3 py-2 rounded-lg text-white text-xs font-bold transition-opacity hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)', boxShadow: '0 4px 14px rgba(236,72,153,0.35)' }}>
                        📞 {t('actionCallPatient')}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Paciente */}
              <div className="rounded-lg border border-border bg-bg-2/30 p-4">
                <div className="flex items-center gap-3">
                  <PersonAvatar firstName={appt.patient.firstName} lastName={appt.patient.lastName} size={10} />
                  <div className="flex-1 min-w-0">
                    <div className="text-text-1 font-bold text-sm">
                      {appt.patient.firstName} {appt.patient.lastName}
                      {appt.case && <span className="ml-2 text-rose font-mono text-[11px]">#{appt.case.caseCode}</span>}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">{t('ageSuffix', { age: ageFromISO(appt.patient.dateOfBirth) })}</div>
                  </div>
                  {isFirst ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full text-white"
                      style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)' }}>🆕 {t('firstVisitBadge')}</span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-bg-2 text-text-muted border border-border">
                      {t('visitNumberLabel', { n: appt.visitNumber + 1 })}
                    </span>
                  )}
                </div>
              </div>

              {/* Info de la cita */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📅 {t('sectionAppointmentInfo')}</div>
                <div className="space-y-2 text-[12.5px]">
                  <Row label={t('rowDateAndTime')}  value={`${dt.dayName} ${dt.date} · ${dt.time}`} highlight />
                  <Row label={t('rowDuration')}      value={`${appt.durationMinutes} min`} />
                  <Row label={t('rowClinic')}        value={appt.clinic.name} />
                  {appt.provider && <Row label={t('rowDoctor')} value={`${t('drPrefix')} ${appt.provider.firstName} ${appt.provider.lastName}`} />}
                  {appt.provider?.specialty && <Row label={t('rowSpecialty')} value={SPECIALTY_LABEL[appt.provider.specialty] ?? appt.provider.specialty} />}
                  <Row label={t('rowType')} value={TYPE_LABEL[appt.type] ?? appt.type} chip chipColor={appt.type === 'AUTO_ACCIDENT' ? 'rose' : 'emerald'} />
                  {appt.case?.accidentDate && (
                    <Row label={t('rowAccidentDate')}
                      value={new Date(appt.case.accidentDate).toLocaleDateString('es-US', { dateStyle: 'medium' })} highlight />
                  )}
                </div>
              </div>

              {/* Checklist pre-cita */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">🎯 {t('sectionPreVisitStatus')}</div>
                <div className="space-y-2">
                  <CheckItem done={intakeDone}    label={t('checklistIntakeForm')}             sublabel={intakeDone ? t('checklistCompleted') : t('checklistIntakePending')} />
                  <CheckItem done={lawyerDone}    label={t('checklistLawyerVerified')}         sublabel={lawyerDone ? (appt.case?.attorney?.firmName ?? (`${appt.case?.attorney?.firstName ?? ''} ${appt.case?.attorney?.lastName ?? ''}`.trim() || '—')) : t('checklistNoLawyer')} />
                  <CheckItem done={insuranceDone} label={t('checklistInsuranceVerified')}      sublabel={insuranceDone ? (appt.case?.primaryInsurance?.name ?? '—') : t('checklistInsurancePending')} />
                  <CheckItem done={appt.status === 'CONFIRMED'} label={t('checklistConfirmationCall')} sublabel={appt.status === 'CONFIRMED' ? t('checklistCallConfirmed') : t('checklistCallNotDone')} />
                </div>
              </div>

              {/* Notas */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">📝 {t('sectionNotes')}</div>
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="text-[10px] text-brand hover:underline flex items-center gap-1">
                    <Edit2 className="w-3 h-3" /> {t('actionEdit')}
                  </button>
                </div>
                <p className="text-text-2 text-[12.5px] leading-relaxed min-h-[40px]">
                  {appt.notes || <span className="text-text-muted italic">{t('notesEmpty')}</span>}
                </p>
              </div>

              {/* Acciones rápidas */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📞 {t('sectionQuickActions')}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {appt.patient.phone && (
                    <a href={`tel:${appt.patient.phone}`}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                      <Phone className="w-4 h-4" /> {t('actionCall')}
                    </a>
                  )}
                  {appt.patient.phone && (
                    <a href={`sms:${appt.patient.phone}`}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                      <MessageSquare className="w-4 h-4" /> {t('actionSms')}
                    </a>
                  )}
                  <button type="button" onClick={() => setRescheduleOpen(true)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                    <RefreshCw className="w-4 h-4" /> {t('actionReschedule')}
                  </button>
                  <button type="button" onClick={() => setActiveModal('intake')}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                    <MessageSquare className="w-4 h-4" /> {t('actionResendForm')}
                  </button>
                </div>
              </div>

              {/* Info detallada */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📂 {t('sectionDetailedInfo')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <SecondaryBtn icon={<User className="w-4 h-4" />}       label={t('secondaryBtnPersonal')}    color="brand"   onClick={() => setActiveModal('personal')} />
                  <SecondaryBtn icon={<Scale className="w-4 h-4" />}      label={t('secondaryBtnLawyer')}      color="rose"    done={lawyerDone}    onClick={() => setActiveModal('lawyer')} />
                  <SecondaryBtn icon={<Shield className="w-4 h-4" />}     label={t('secondaryBtnInsurance')}   color="emerald" done={insuranceDone} onClick={() => setActiveModal('insurance')} />
                  <SecondaryBtn icon={<Headphones className="w-4 h-4" />} label={t('secondaryBtnCallHandler')} color="cyan"    onClick={() => setActiveModal('callHandler')} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Tab: Servicios ──────────────────────────────────── */}
          {activeTab === 'services' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">

              {/* Header con total */}
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionCptServices')}</div>
                <div className="flex items-center gap-2">
                  {savingSvc && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
                  {savedOk   && <span className="text-[10px] text-emerald">{t('savedOk')}</span>}
                  <span className="text-sm font-bold text-cyan">{fmt$(svcTotal)}</span>
                </div>
              </div>

              {/* Buscador inline */}
              {!svcLoaded ? (
                <div className="flex items-center justify-center py-6 text-text-muted text-xs gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={e => setServiceSearch(e.target.value)}
                    placeholder={t('searchServicePlaceholder')}
                    className="w-full bg-bg-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-cyan transition-colors"
                  />
                  {serviceSearch && (
                    <button type="button" onClick={() => { setServiceSearch(''); setServiceResults([]); }}
                      className="absolute right-3 top-2.5 text-text-muted hover:text-text-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Resultados dropdown */}
                  {(searchingSvc || serviceResults.length > 0) && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                      {searchingSvc && (
                        <div className="px-3 py-2 text-text-muted text-xs flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> {t('searching')}
                        </div>
                      )}
                      {serviceResults.map(svc => {
                        const already = !!services.find(s => s.id === svc.id);
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => !already && addService(svc)}
                            disabled={already}
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-border/40 last:border-0 transition-colors ${
                              already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-2'
                            }`}
                          >
                            <span className="font-mono text-[11px] text-cyan shrink-0 w-14">{svc.code}</span>
                            <span className="flex-1 text-xs text-text-1 truncate">{svc.description}</span>
                            <span className="text-xs font-semibold text-text-2 shrink-0">{fmt$(svc.fee)}</span>
                            {already
                              ? <Check className="w-3.5 h-3.5 text-emerald shrink-0" />
                              : <Plus className="w-3.5 h-3.5 text-brand shrink-0" />
                            }
                          </button>
                        );
                      })}
                      {!searchingSvc && serviceResults.length === 0 && serviceSearch.length >= 2 && (
                        <div className="px-3 py-2 text-text-muted text-xs">{t('noResultsFor', { query: serviceSearch })}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Lista de servicios seleccionados */}
              {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Stethoscope className="w-8 h-8 text-text-muted/40 mb-3" />
                  <div className="text-text-muted text-sm">{t('emptyServicesTitle')}</div>
                  <div className="text-text-muted/60 text-xs mt-1">{t('emptyServicesHint')}</div>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[60px_1fr_90px_36px] text-[10px] uppercase tracking-wider text-text-muted font-semibold px-3 py-2 bg-bg-2/50 border-b border-border/50">
                    <span>{t('colCode')}</span>
                    <span>{t('colDescription')}</span>
                    <span className="text-right">{t('colCost')}</span>
                    <span />
                  </div>
                  {services.map(svc => (
                    <div key={svc.id} className="grid grid-cols-[60px_1fr_90px_36px] items-center px-3 py-2 border-b border-border/30 last:border-0 hover:bg-bg-2/30 transition-colors">
                      <span className="font-mono text-[11px] text-cyan">{svc.code}</span>
                      <span className="text-xs text-text-1 pr-2 truncate">{svc.description}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={svc.fee}
                        onBlur={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v !== svc.fee) updateServiceFee(svc.id, v);
                        }}
                        className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-cyan rounded px-1.5 py-0.5 text-xs font-semibold text-text-1 focus:outline-none focus:bg-bg-2 transition-colors"
                      />
                      <button type="button" onClick={() => removeService(svc.id)}
                        className="flex items-center justify-center w-7 h-7 rounded hover:bg-rose/10 text-text-muted hover:text-rose transition-colors ml-auto">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 bg-bg-2/50 flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('totalEstimated')}</span>
                    <span className="text-sm font-bold text-cyan">{fmt$(svcTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Tab: Pagos ──────────────────────────────────────── */}
          {activeTab === 'payments' && (() => {
            const pending      = billings.filter(b => b.balanceDue > 0);
            const totalPending = pending.reduce((s, b) => s + b.balanceDue, 0);
            const payTotal     = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const sourceOpts   = [{ label: t('sourcePatient'), value: 'PATIENT' }, { label: t('sourceInsurance'), value: 'INSURANCE' }, { label: t('sourceLawyer'), value: 'LAWYER' }];
            const methodOpts   = [{ label: t('methodCheck'), value: 'CHECK' }, { label: t('methodCard'), value: 'CARD' }, { label: t('methodCash'), value: 'CASH' }, { label: t('methodTransfer'), value: 'TRANSFER' }, { label: t('methodNone'), value: 'NONE' }];
            const typeOpts     = (PAYMENT_TYPE_KEYS[paySource] ?? []).map(o => ({ label: t(o.tKey as Parameters<typeof t>[0]), value: o.value }));
            const insuranceOpts = insurances.map(i => ({ label: i.label, value: i.id }));

            return (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {!appt.case ? (
                  <div className="text-text-muted text-sm text-center py-8">{t('noCaseAssociated')}</div>
                ) : loadingBill ? (
                  <div className="flex items-center justify-center py-10 text-text-muted text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('loadingBillingData')}
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-amber" />
                        <span className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('sectionFinancialSummary')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setBillLoaded(false); }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                          <RefreshCw className={`w-3 h-3 ${loadingBill ? 'animate-spin' : ''}`} /> {t('actionRefresh')}
                        </button>
                        {billKpis.totalBalance > 0 && (
                          <button type="button" onClick={openPayModal}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 transition-colors">
                            <CreditCard className="w-3.5 h-3.5" /> {t('actionPayDebt')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* KPIs */}
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { label: t('kpiTotalCost'),    value: billKpis.totalCost,    color: 'text-text-1' },
                        { label: t('kpiTotalPaid'),    value: billKpis.totalPaid,    color: 'text-emerald' },
                        { label: t('kpiTotalBalance'), value: billKpis.totalBalance, color: billKpis.totalBalance > 0 ? 'text-rose' : 'text-text-1' },
                      ].map(k => (
                        <div key={k.label} className="rounded-lg border border-border bg-bg-1 p-4 flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{k.label}</div>
                          <div className={`text-xl font-bold font-mono ${k.color}`}>{fmt$(k.value)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Table */}
                    {billings.length === 0 ? (
                      <div className="flex flex-col items-center py-10 text-center">
                        <DollarSign className="w-8 h-8 text-text-muted/40 mb-3" />
                        <div className="text-text-muted text-sm">{t('emptyBillingTitle')}</div>
                        <div className="text-text-muted/60 text-xs mt-1">{t('emptyBillingHint')}</div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="px-4 py-2 bg-bg-2/60 border-b border-border">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('billingDetailByVisit')}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60 bg-bg-2/40">
                                <th className="w-6 px-2" />
                                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colDate')}</th>
                                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colCost')}</th>
                                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">{t('colDiscount')}</th>
                                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colPaid')}</th>
                                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colPending')}</th>
                                <th className="w-10 px-3 py-2.5" />
                              </tr>
                            </thead>
                            <tbody>
                              {billings.map(b => {
                                const isThisAppt = b.appointmentId === appt.id;
                                const isExp      = expanded.has(b.id);
                                const discPct    = b.totalCost > 0 && b.discount > 0
                                  ? ((b.discount / b.totalCost) * 100).toFixed(2) : '0.00';

                                return (
                                  <>
                                    <tr key={b.id}
                                      className={`border-b border-border/40 hover:bg-white/[0.02] cursor-pointer ${b.balanceDue <= 0 ? 'opacity-75' : ''} ${isThisAppt ? 'bg-cyan/5' : ''}`}
                                      onClick={() => toggleExpanded(b.id)}
                                    >
                                      <td className="px-2 py-3 text-text-muted">
                                        {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </td>
                                      <td className="px-3 py-3 text-text-1 font-mono text-xs whitespace-nowrap">
                                        <span className="flex items-center gap-1.5">
                                          {b.appointmentDate
                                            ? new Date(b.appointmentDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                                            : '—'}
                                          {isThisAppt && <span className="text-[9px] font-bold text-cyan bg-cyan/15 px-1 rounded leading-4">{t('billingThisVisitBadge')}</span>}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3 text-right font-semibold font-mono text-xs whitespace-nowrap">{fmt$(b.totalCost)}</td>
                                      <td className="px-3 py-3 text-right text-text-muted font-mono text-xs whitespace-nowrap hidden md:table-cell">{discPct}%</td>
                                      <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                                        <span className={b.amountPaid > 0 ? 'text-emerald font-semibold' : 'text-text-muted'}>{fmt$(b.amountPaid)}</span>
                                      </td>
                                      <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                                        {b.balanceDue > 0
                                          ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold">{fmt$(b.balanceDue)}</span>
                                          : <span className="text-emerald font-semibold text-xs">{fmt$(0)}</span>}
                                      </td>
                                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                        <button className="p-1 rounded text-text-muted hover:text-cyan transition-colors" title={t('tooltipNote')}>
                                          <FileText className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>

                                    {/* Sub-filas de pagos */}
                                    {isExp && (
                                      <tr key={`${b.id}-pays`} className="border-b border-border/40 bg-bg-2/30">
                                        <td colSpan={7} className="px-6 py-0">
                                          {b.payments.length === 0 ? (
                                            <div className="py-3 text-text-muted text-xs italic">{t('emptyPayments')}</div>
                                          ) : (
                                            <table className="w-full text-xs my-2">
                                              <thead>
                                                <tr className="text-text-muted">
                                                  <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">{t('colPaymentDate')}</th>
                                                  <th className="text-right py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider">{t('colAmount')}</th>
                                                  <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">{t('colMethod')}</th>
                                                  <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">{t('colPaidBy')}</th>
                                                  <th className="text-left py-1.5 pr-4 font-semibold text-[10px] uppercase tracking-wider hidden md:table-cell">{t('colStatus')}</th>
                                                  <th className="w-8" />
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-border/20">
                                                {b.payments.map(p => (
                                                  <tr key={p.id} className={p.status === 'CANCELLED' ? 'opacity-40' : ''}>
                                                    <td className="py-1.5 pr-4 font-mono text-text-2">{p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—'}</td>
                                                    <td className="py-1.5 pr-4 text-right font-mono font-semibold text-emerald whitespace-nowrap">{fmt$(p.amount)}</td>
                                                    <td className="py-1.5 pr-4 text-text-2 hidden sm:table-cell">{METHOD_TKEYS[p.method] ? t(METHOD_TKEYS[p.method] as Parameters<typeof t>[0]) : p.method}</td>
                                                    <td className="py-1.5 pr-4 text-text-2 hidden sm:table-cell">
                                                      {SOURCE_TKEYS[p.source] ? t(SOURCE_TKEYS[p.source] as Parameters<typeof t>[0]) : p.source}
                                                      {p.insuranceCarrier && <span className="text-text-muted"> · {p.insuranceCarrier.name}</span>}
                                                    </td>
                                                    <td className="py-1.5 pr-4 hidden md:table-cell">
                                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                        p.status === 'COMPLETED' ? 'bg-emerald/10 text-emerald' :
                                                        p.status === 'CANCELLED' ? 'bg-rose/10 text-rose' : 'bg-amber/10 text-amber'
                                                      }`}>
                                                        {p.status === 'COMPLETED' ? t('paymentStatusCompleted') : p.status === 'CANCELLED' ? t('paymentStatusCancelled') : t('paymentStatusPending')}
                                                      </span>
                                                    </td>
                                                    <td className="py-1.5">
                                                      {p.status !== 'CANCELLED' && (
                                                        <button onClick={() => deletePayment(b.id, p.id)} disabled={deletingPay === p.id}
                                                          className="p-1 rounded text-text-muted hover:text-rose transition-colors disabled:opacity-50" title={t('tooltipCancelPayment')}>
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
                                  </>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Modal: Pagar deuda ──────────────────────────────── */}
                    {payOpen && (
                      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 overflow-y-auto" onClick={() => setPayOpen(false)}>
                        <div className="bg-bg-1 border border-border rounded-xl w-full max-w-3xl my-8 overflow-hidden" onClick={e => e.stopPropagation()}>

                          {/* Modal header */}
                          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div>
                              <h2 className="text-text-1 font-semibold text-base flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-amber" /> {t('payModalTitle')}
                              </h2>
                              <p className="text-text-muted text-xs mt-0.5">{t('payModalSubtitle')}</p>
                            </div>
                            <button onClick={() => setPayOpen(false)} className="text-text-muted hover:text-text-1 transition-colors p-1">
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Summary bar */}
                          <div className="grid grid-cols-2 border-b border-border">
                            <div className="px-5 py-3 border-r border-border">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payModalTotalPending')}</div>
                              <div className="text-xl font-bold font-mono text-rose mt-0.5">{fmt$(totalPending)}</div>
                            </div>
                            <div className="px-5 py-3">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payModalPendingCount')}</div>
                              <div className="text-xl font-bold font-mono text-text-1 mt-0.5">{pending.length}</div>
                            </div>
                          </div>

                          {/* Distribution table */}
                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-bg-2/95 backdrop-blur-sm border-b border-border">
                                <tr>
                                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colDate')}</th>
                                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colCost')}</th>
                                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">{t('colDiscount')}</th>
                                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colPaid')}</th>
                                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colPending')}</th>
                                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted w-28">{t('colPayAction')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {pending.map(b => {
                                  const discPct = b.totalCost > 0 ? ((b.discount / b.totalCost) * 100).toFixed(2) : '0.00';
                                  const isThisAppt = b.appointmentId === appt.id;
                                  return (
                                    <tr key={b.id} className={`hover:bg-white/[0.02] ${isThisAppt ? 'bg-cyan/5' : ''}`}>
                                      <td className="px-4 py-3 text-text-1 font-mono text-xs whitespace-nowrap">
                                        <span className="flex items-center gap-1.5">
                                          {b.appointmentDate ? new Date(b.appointmentDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—'}
                                          {isThisAppt && <span className="text-[9px] font-bold text-cyan bg-cyan/15 px-1 rounded leading-4">{t('billingThisVisitBadge')}</span>}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3 text-right font-mono text-xs">{fmt$(b.totalCost)}</td>
                                      <td className="px-3 py-3 text-right text-text-muted font-mono text-xs hidden md:table-cell">{discPct}%</td>
                                      <td className="px-3 py-3 text-right text-emerald font-mono text-xs">{fmt$(b.amountPaid)}</td>
                                      <td className="px-3 py-3 text-right">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold">{fmt$(b.balanceDue)}</span>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div className="flex items-center gap-1">
                                          <input type="number" min="0" max={b.balanceDue} step="0.01"
                                            value={payAmounts[b.id] ?? ''}
                                            onChange={e => {
                                              const raw = parseFloat(e.target.value);
                                              const val = isNaN(raw) ? '' : Math.min(raw, b.balanceDue).toFixed(2);
                                              setPayAmounts(prev => ({ ...prev, [b.id]: val }));
                                            }}
                                            className="w-full rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 font-mono text-right outline-none focus:border-brand"
                                            placeholder="0.00"
                                          />
                                          <button type="button"
                                            onClick={() => setPayAmounts(prev => ({ ...prev, [b.id]: b.balanceDue.toFixed(2) }))}
                                            className="text-[10px] text-brand hover:text-brand/70 transition-colors font-semibold flex-shrink-0">
                                            MAX
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Footer */}
                          <div className="px-5 py-4 border-t border-border bg-bg-2/30 space-y-3">
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payFooterTitle')}</div>
                            <div className="grid grid-cols-3 gap-2">
                              <SelectUp value={paySource} onChange={v => {
                                const src = v as typeof paySource;
                                setPaySource(src);
                                setPayType(PAYMENT_TYPE_KEYS[src]?.[0]?.value ?? '');
                                if (src === 'INSURANCE') setPayInsuranceId(insurances[0]?.id ?? '');
                              }} options={sourceOpts} />
                              <SelectUp value={payMethod} onChange={setPayMethod} options={methodOpts} />
                              {paySource === 'INSURANCE' ? (
                                <SelectUp value={payInsuranceId} onChange={setPayInsuranceId}
                                  options={insuranceOpts.length ? insuranceOpts : [{ label: t('noInsurancesInCase'), value: '' }]}
                                  placeholder={t('selectInsurancePlaceholder')} />
                              ) : (
                                <SelectUp value={payType} onChange={setPayType} options={typeOpts} />
                              )}
                            </div>
                            {paySource === 'INSURANCE' && (
                              <SelectUp value={payType} onChange={setPayType} options={typeOpts} />
                            )}
                            <div className="flex items-center gap-2">
                              <input type="number" min="0" step="0.01" placeholder="0"
                                onChange={e => autoDistribute(e.target.value)}
                                className="flex-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 font-mono outline-none focus:border-brand"
                                title={t('autoDistributeTooltip')} />
                              <button type="button" onClick={submitPayment}
                                disabled={paying || payTotal <= 0}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber text-black text-sm font-semibold hover:bg-amber/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                                {paying
                                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payProcessing')}</>
                                  : <>{t('actionPay')}{payTotal > 0 ? ` ${fmt$(payTotal)}` : '…'}</>
                                }
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ─── Footer ──────────────────────────────────────────── */}
          {activeTab === 'detail' && (
            <div className="shrink-0 px-5 py-4 border-t border-border flex flex-col gap-2">
              {cancelOpen ? (
                <div className="rounded-lg border border-rose/30 bg-rose/5 p-3 space-y-2">
                  <p className="text-rose text-xs font-semibold">{t('cancelConfirmTitle')}</p>
                  <p className="text-text-muted text-[11px]">{t('cancelConfirmWarning')}</p>
                  {cancelError && <p className="text-rose text-[11px] flex items-center gap-1"><AlertCircle className="w-3 h-3" />{cancelError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setCancelOpen(false); setCancelError(null); }} disabled={cancelling}
                      className="flex-1 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                      {t('actionBack')}
                    </button>
                    <button type="button" onClick={handleCancel} disabled={cancelling}
                      className="flex-1 px-3 py-1.5 rounded-md bg-rose/15 border border-rose/40 text-rose text-xs font-semibold hover:bg-rose/20 transition-colors flex items-center justify-center gap-1.5">
                      {cancelling ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      {cancelling ? t('cancellingInProgress') : t('confirmCancelYes')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button type="button" onClick={() => setCancelOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-rose/30 text-rose hover:bg-rose/10 text-xs font-medium transition-colors sm:mr-auto">
                    <Ban className="w-3.5 h-3.5" /> {t('actionCancelAppointment')}
                  </button>
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> {t('actionEdit')}
                  </button>
                  {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
                    <button type="button" onClick={handleConfirm} disabled={confirming}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-emerald/15 border border-emerald/40 text-emerald hover:bg-emerald/20 text-xs font-semibold transition-colors disabled:opacity-50">
                      {confirming ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {t('actionMarkConfirmed')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

      {/* Secondary modals */}
      {activeModal && (
        <AppointmentSecondaryModals
          type={activeModal}
          appointment={appt}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Reagendar */}
      <AppointmentDialog
        mode="free"
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        initialDate={dt.dateInput}
        initialTime={dt.timeInput}
        onSuccess={() => { onRefresh(); onClose(); }}
      />

      {/* Editar */}
      {appt.case && (
        <AppointmentDialog
          mode="free"
          open={editOpen}
          onOpenChange={setEditOpen}
          editAppointment={{
            id:              appt.id,
            scheduledFor:    appt.scheduledFor,
            durationMinutes: appt.durationMinutes,
            type:            appt.type,
            notes:           appt.notes,
            clinicId:        appt.clinic.id,
            providerId:      appt.provider?.id ?? null,
            caseId:          appt.case.id,
            caseCode:        appt.case.caseCode,
            patient: {
              id:        appt.patient.id,
              firstName: appt.patient.firstName,
              lastName:  appt.patient.lastName,
            },
          }}
          onSuccess={() => { onRefresh(); setEditOpen(false); }}
        />
      )}
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-1 max-h-[600px]">
        {panelContent}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {panelContent}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, highlight, chip, chipColor }: {
  label: string; value: string; highlight?: boolean; chip?: boolean; chipColor?: 'rose' | 'emerald';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      {chip ? (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
          chipColor === 'rose' ? 'bg-rose/15 text-rose border border-rose/30' : 'bg-emerald/15 text-emerald border border-emerald/30'
        }`}>{value}</span>
      ) : (
        <span className={highlight ? 'text-text-1 font-semibold' : 'text-text-2'}>{value}</span>
      )}
    </div>
  );
}

function CheckItem({ done, label, sublabel }: { done: boolean; label: string; sublabel: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 shrink-0 ${done ? 'text-emerald' : 'text-amber'}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] ${done ? 'text-text-1' : 'text-text-2'}`}>{label}</div>
        <div className={`text-[11px] ${done ? 'text-emerald' : 'text-amber'}`}>{sublabel}</div>
      </div>
    </div>
  );
}

type BtnColor = 'brand' | 'rose' | 'emerald' | 'cyan';
const BTN_COLOR_MAP: Record<BtnColor, { bg: string; border: string; text: string }> = {
  brand:   { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.25)',  text: '#a5b4fc' },
  rose:    { bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.25)',   text: '#fda4af' },
  emerald: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)', text: '#6ee7b7' },
  cyan:    { bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.25)',  text: '#67e8f9' },
};

function SecondaryBtn({ icon, label, color, done, onClick }: {
  icon: React.ReactNode; label: string; color: BtnColor; done?: boolean; onClick: () => void;
}) {
  const c = BTN_COLOR_MAP[color];
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-opacity hover:opacity-80"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ color: c.text }}>{icon}</span>
      <span className="flex-1 text-[12.5px] font-medium" style={{ color: c.text }}>{label}</span>
      {done !== undefined && <span className={`text-[10px] ${done ? 'text-emerald' : 'text-amber'}`}>{done ? '✓' : '⏳'}</span>}
      <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
    </button>
  );
}
