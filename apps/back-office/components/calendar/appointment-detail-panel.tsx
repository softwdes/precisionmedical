'use client';

/**
 * B.11 — AppointmentDetailPanel (modal centrado con tabs)
 *
 * Tab 1: Detalle — info cita, checklist, notas, acciones
 * Tab 2: Servicios — CPT inline typeahead, auto-save
 * Tab 3: Pagos — KPIs del caso + registrar pago inline
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, MessageSquare, RefreshCw, Calendar,
  CheckCircle2, AlertTriangle, ChevronRight,
  User, Scale, Shield, Headphones, Check, Edit2, Ban,
  AlertCircle, Search, X, Plus, Trash2, DollarSign,
  Stethoscope, Loader2, Clock,
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

interface BillingRecord {
  id: string;
  appointmentId: string | null;
  appointmentDate: string | null;
  totalCost: number;
  discount: number;
  amountPaid: number;
  balanceDue: number;
  payments: Array<{
    id: string;
    amount: number;
    source: string;
    method: string;
    paymentType: string | null;
    paidAt: string | null;
    notes: string | null;
  }>;
}

interface Props {
  appointment: CalendarAppointment;
  onClose: () => void;
  onRefresh: () => void;
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

const STATUS_CONFIG: Record<string, { label: string; state: StatusState }> = {
  SCHEDULED:   { label: 'Agendada',       state: 'info'    },
  CONFIRMED:   { label: 'Confirmada',     state: 'success' },
  IN_PROGRESS: { label: 'En curso',       state: 'active'  },
  COMPLETED:   { label: 'Atendida',       state: 'success' },
  PENDING:     { label: 'Pendiente',      state: 'warning' },
  NO_SHOW:     { label: 'No se presentó', state: 'danger'  },
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// ─── Componente principal ─────────────────────────────────────────────────────

export function AppointmentDetailPanel({ appointment: appt, onClose, onRefresh }: Props) {
  const router = useRouter();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('detail');

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
  const [billingData,    setBillingData]    = useState<{ kpis: { totalCost: number; totalPaid: number; totalBalance: number }; billings: BillingRecord[] } | null>(null);
  const [loadingBill,    setLoadingBill]    = useState(false);
  const [expandedPay,    setExpandedPay]    = useState<string | null>(null); // billingId with form open
  const [expandedHist,   setExpandedHist]   = useState<string | null>(null); // billingId with history open
  const [paySource,      setPaySource]      = useState<'INSURANCE'|'PATIENT'|'LAWYER'>('PATIENT');
  const [payMethod,      setPayMethod]      = useState<'CHECK'|'CARD'|'CASH'|'TRANSFER'>('CHECK');
  const [payType,        setPayType]        = useState('self_pay');
  const [payAmount,      setPayAmount]      = useState('');
  const [payNotes,       setPayNotes]       = useState('');
  const [submittingPay,  setSubmittingPay]  = useState(false);

  const isFirst   = appt.visitNumber === 0;
  const dt        = formatDateTime(appt.scheduledFor);
  const statusCfg = STATUS_CONFIG[appt.status] ?? { label: appt.status, state: 'info' as StatusState };
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
  useEffect(() => {
    if (activeTab !== 'payments' || billingData || !appt.case?.id) return;
    setLoadingBill(true);
    fetch(`/api/admin/cases/${appt.case.id}/billing`)
      .then(r => r.json())
      .then(setBillingData)
      .catch(() => {})
      .finally(() => setLoadingBill(false));
  }, [activeTab, appt.case?.id, billingData]);

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
      setCancelError(e instanceof Error ? e.message : 'Error al cancelar');
    } finally { setCancelling(false); }
  };

  // ── Payment handler ───────────────────────────────────────────────────────
  const handleRegisterPayment = async (billingId: string) => {
    if (!billingId || !payAmount || !appt.case?.id) return;
    setSubmittingPay(true);
    try {
      const res = await fetch(`/api/admin/cases/${appt.case.id}/billing/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [{ billingId, amount: parseFloat(payAmount), notes: payNotes.trim() || null }],
          source: paySource, method: payMethod,
          paymentType: payType, insuranceCarrierId: null, paidAt: null,
        }),
      });
      if (res.ok) {
        setBillingData(null);
        setExpandedPay(null);
        setPayAmount('');
        setPayNotes('');
      }
    } finally { setSubmittingPay(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'detail',   label: 'Detalle',   icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'services', label: 'Servicios', icon: <Stethoscope className="w-3.5 h-3.5" /> },
    { id: 'payments', label: 'Pagos',     icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[90vh]">

          {/* ─── Header ──────────────────────────────────────────── */}
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

          {/* ─── Tabs ────────────────────────────────────────────── */}
          <div className="flex border-b border-border shrink-0">
            {TABS.map(tab => (
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
                      <div className="text-white font-bold text-sm">PRIMERA CITA — llamar al paciente para confirmar</div>
                      <div className="text-text-2 text-xs mt-1 leading-relaxed">Verificar antes de la fecha: DOL · abogado · seguro · formulario completado.</div>
                    </div>
                    {appt.patient.phone && (
                      <a href={`tel:${appt.patient.phone}`}
                        className="shrink-0 px-3 py-2 rounded-lg text-white text-xs font-bold transition-opacity hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)', boxShadow: '0 4px 14px rgba(236,72,153,0.35)' }}>
                        📞 Llamar
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
                    <div className="text-text-muted text-xs mt-0.5">{ageFromISO(appt.patient.dateOfBirth)} años</div>
                  </div>
                  {isFirst ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full text-white"
                      style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)' }}>🆕 1ra cita</span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-bg-2 text-text-muted border border-border">
                      Visita {appt.visitNumber + 1}
                    </span>
                  )}
                </div>
              </div>

              {/* Info de la cita */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📅 Información de la cita</div>
                <div className="space-y-2 text-[12.5px]">
                  <Row label="Fecha y hora"  value={`${dt.dayName} ${dt.date} · ${dt.time}`} highlight />
                  <Row label="Duración"      value={`${appt.durationMinutes} min`} />
                  <Row label="Clínica"       value={appt.clinic.name} />
                  {appt.provider && <Row label="Doctor" value={`Dr. ${appt.provider.firstName} ${appt.provider.lastName}`} />}
                  {appt.provider?.specialty && <Row label="Especialidad" value={SPECIALTY_LABEL[appt.provider.specialty] ?? appt.provider.specialty} />}
                  <Row label="Tipo" value={TYPE_LABEL[appt.type] ?? appt.type} chip chipColor={appt.type === 'AUTO_ACCIDENT' ? 'rose' : 'emerald'} />
                  {appt.case?.accidentDate && (
                    <Row label="Fecha accidente (DOL)"
                      value={new Date(appt.case.accidentDate).toLocaleDateString('es-US', { dateStyle: 'medium' })} highlight />
                  )}
                </div>
              </div>

              {/* Checklist pre-cita */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">🎯 Estado pre-cita</div>
                <div className="space-y-2">
                  <CheckItem done={intakeDone}    label="Formulario del paciente"             sublabel={intakeDone ? 'Completado' : 'Pendiente — reenviar si necesario'} />
                  <CheckItem done={lawyerDone}    label="Abogado verificado"                  sublabel={lawyerDone ? (appt.case?.attorney?.firmName ?? (`${appt.case?.attorney?.firstName ?? ''} ${appt.case?.attorney?.lastName ?? ''}`.trim() || '—')) : 'Sin abogado asignado'} />
                  <CheckItem done={insuranceDone} label="PIP / Seguro verificado"             sublabel={insuranceDone ? (appt.case?.primaryInsurance?.name ?? '—') : 'Pendiente de verificar'} />
                  <CheckItem done={appt.status === 'CONFIRMED'} label="Llamada de confirmación (24h antes)" sublabel={appt.status === 'CONFIRMED' ? 'Confirmada' : 'No realizada'} />
                </div>
              </div>

              {/* Notas */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">📝 Notas de la cita</div>
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="text-[10px] text-brand hover:underline flex items-center gap-1">
                    <Edit2 className="w-3 h-3" /> Editar
                  </button>
                </div>
                <p className="text-text-2 text-[12.5px] leading-relaxed min-h-[40px]">
                  {appt.notes || <span className="text-text-muted italic">Sin notas.</span>}
                </p>
              </div>

              {/* Acciones rápidas */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📞 Acciones rápidas</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {appt.patient.phone && (
                    <a href={`tel:${appt.patient.phone}`}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                      <Phone className="w-4 h-4" /> Llamar
                    </a>
                  )}
                  {appt.patient.phone && (
                    <a href={`sms:${appt.patient.phone}`}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                      <MessageSquare className="w-4 h-4" /> SMS
                    </a>
                  )}
                  <button type="button" onClick={() => setRescheduleOpen(true)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                    <RefreshCw className="w-4 h-4" /> Reagendar
                  </button>
                  <button type="button" onClick={() => setActiveModal('intake')}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                    <MessageSquare className="w-4 h-4" /> Reenviar form
                  </button>
                </div>
              </div>

              {/* Info detallada */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📂 Ver información detallada</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <SecondaryBtn icon={<User className="w-4 h-4" />}       label="Datos personales"      color="brand"   onClick={() => setActiveModal('personal')} />
                  <SecondaryBtn icon={<Scale className="w-4 h-4" />}      label="Abogado & bufete"      color="rose"    done={lawyerDone}    onClick={() => setActiveModal('lawyer')} />
                  <SecondaryBtn icon={<Shield className="w-4 h-4" />}     label="Seguro (PIP)"          color="emerald" done={insuranceDone} onClick={() => setActiveModal('insurance')} />
                  <SecondaryBtn icon={<Headphones className="w-4 h-4" />} label="Quién atendió llamada" color="cyan"    onClick={() => setActiveModal('callHandler')} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Tab: Servicios ──────────────────────────────────── */}
          {activeTab === 'services' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">

              {/* Header con total */}
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">CPT / Servicios planificados</div>
                <div className="flex items-center gap-2">
                  {savingSvc && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
                  {savedOk   && <span className="text-[10px] text-emerald">✓ Guardado</span>}
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
                    placeholder="Buscar por código o descripción (ej: 98941, manipulation...)"
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
                          <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
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
                        <div className="px-3 py-2 text-text-muted text-xs">Sin resultados para "{serviceSearch}"</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Lista de servicios seleccionados */}
              {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Stethoscope className="w-8 h-8 text-text-muted/40 mb-3" />
                  <div className="text-text-muted text-sm">Sin servicios planificados</div>
                  <div className="text-text-muted/60 text-xs mt-1">Busca un código CPT arriba para agregar</div>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[60px_1fr_90px_36px] text-[10px] uppercase tracking-wider text-text-muted font-semibold px-3 py-2 bg-bg-2/50 border-b border-border/50">
                    <span>Código</span>
                    <span>Descripción</span>
                    <span className="text-right">Costo</span>
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
                    <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Total estimado</span>
                    <span className="text-sm font-bold text-cyan">{fmt$(svcTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Tab: Pagos ──────────────────────────────────────── */}
          {activeTab === 'payments' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!appt.case ? (
                <div className="text-text-muted text-sm text-center py-8">Sin caso asociado a esta cita.</div>
              ) : loadingBill ? (
                <div className="flex items-center justify-center py-10 text-text-muted text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando datos de facturación...
                </div>
              ) : billingData ? (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total facturado', value: billingData.kpis.totalCost,    color: 'text-text-1' },
                      { label: 'Pagado',           value: billingData.kpis.totalPaid,    color: 'text-emerald' },
                      { label: 'Balance',          value: billingData.kpis.totalBalance, color: billingData.kpis.totalBalance > 0 ? 'text-amber' : 'text-text-muted' },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg border border-border bg-bg-2/40 p-3 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{k.label}</div>
                        <div className={`text-sm font-bold ${k.color}`}>{fmt$(k.value)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Table */}
                  {billingData.billings.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <DollarSign className="w-8 h-8 text-text-muted/40 mb-3" />
                      <div className="text-text-muted text-sm">Sin registros de facturación aún</div>
                      <div className="text-text-muted/60 text-xs mt-1">Se generan al completar la visita</div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {/* Table header */}
                      <div className="grid grid-cols-[1fr_68px_64px_64px_72px] text-[10px] uppercase tracking-wider text-text-muted font-semibold px-3 py-2 bg-bg-2/60 border-b border-border">
                        <span>Fecha</span>
                        <span className="text-right">Costo</span>
                        <span className="text-right">Pagado</span>
                        <span className="text-right">Balance</span>
                        <span />
                      </div>

                      {billingData.billings.map(b => {
                        const isThisAppt = b.appointmentId === appt.id;
                        const isPaying   = expandedPay  === b.id;
                        const showHist   = expandedHist === b.id;
                        const discPct    = b.totalCost > 0 && b.discount > 0
                          ? Math.round((b.discount / b.totalCost) * 100) : 0;

                        return (
                          <div key={b.id} className="border-b border-border/40 last:border-0">
                            {/* Main row */}
                            <div className={`grid grid-cols-[1fr_68px_64px_64px_72px] items-center px-3 py-2.5 transition-colors ${isThisAppt ? 'bg-cyan/5' : 'hover:bg-bg-2/20'}`}>
                              {/* Fecha + badge */}
                              <button
                                type="button"
                                onClick={() => setExpandedHist(showHist ? null : b.id)}
                                className="flex items-center gap-1.5 text-left"
                              >
                                {b.payments.length > 0
                                  ? <ChevronRight className={`w-3 h-3 text-text-muted shrink-0 transition-transform ${showHist ? 'rotate-90' : ''}`} />
                                  : <span className="w-3 shrink-0" />
                                }
                                <span className="text-xs text-text-1">
                                  {b.appointmentDate
                                    ? new Date(b.appointmentDate).toLocaleDateString('es-US', { month: 'short', day: 'numeric' })
                                    : '—'}
                                </span>
                                {isThisAppt && (
                                  <span className="text-[9px] font-bold text-cyan bg-cyan/15 px-1 rounded leading-4">Esta</span>
                                )}
                                {discPct > 0 && (
                                  <span className="text-[9px] text-violet bg-violet/10 px-1 rounded leading-4">-{discPct}%</span>
                                )}
                              </button>

                              <span className="text-xs text-text-2 text-right">{fmt$(b.totalCost)}</span>
                              <span className="text-xs text-emerald text-right">{fmt$(b.amountPaid)}</span>
                              <span className={`text-xs font-semibold text-right ${b.balanceDue > 0 ? 'text-amber' : 'text-text-muted'}`}>
                                {fmt$(b.balanceDue)}
                              </span>

                              {/* Action */}
                              <div className="flex justify-end">
                                {b.balanceDue > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedPay(isPaying ? null : b.id);
                                      if (!isPaying) setPayAmount(String(b.balanceDue));
                                    }}
                                    className={`text-[10px] px-2 py-1 rounded border font-medium transition-colors ${
                                      isPaying
                                        ? 'bg-brand/20 border-brand/50 text-brand'
                                        : 'bg-bg-2 border-border text-text-2 hover:border-brand/40 hover:text-brand'
                                    }`}
                                  >
                                    {isPaying ? 'Cerrar' : '+ Pagar'}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-emerald flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> Saldado
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Payment history (expanded) */}
                            {showHist && b.payments.length > 0 && (
                              <div className="px-4 py-2 bg-bg-2/30 border-t border-border/30 space-y-1.5">
                                {b.payments.map(p => (
                                  <div key={p.id} className="flex items-center justify-between text-[11px]">
                                    <span className="flex items-center gap-1.5 text-text-muted">
                                      <Check className="w-3 h-3 text-emerald shrink-0" />
                                      <span className="capitalize">{p.source.toLowerCase()}</span>
                                      {' · '}
                                      <span className="capitalize">{p.method.toLowerCase()}</span>
                                      {p.paymentType && (
                                        <span className="text-text-muted/60">· {p.paymentType.replace(/_/g, ' ')}</span>
                                      )}
                                      {p.paidAt && (
                                        <span>· {new Date(p.paidAt).toLocaleDateString('es-US', { dateStyle: 'short' })}</span>
                                      )}
                                      {p.notes && <span className="italic text-text-muted/60">· {p.notes}</span>}
                                    </span>
                                    <span className="text-emerald font-semibold ml-3">{fmt$(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Inline payment form */}
                            {isPaying && (
                              <div className="px-4 py-3 bg-brand/5 border-t border-brand/20 space-y-3">
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-brand">Registrar pago</div>

                                {/* Row 1: Fuente / Método / Tipo */}
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Fuente</label>
                                    <select value={paySource} onChange={e => setPaySource(e.target.value as typeof paySource)}
                                      className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand">
                                      <option value="PATIENT">Paciente</option>
                                      <option value="INSURANCE">Seguro</option>
                                      <option value="LAWYER">Abogado</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Método</label>
                                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as typeof payMethod)}
                                      className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand">
                                      <option value="CHECK">Cheque</option>
                                      <option value="CARD">Tarjeta</option>
                                      <option value="CASH">Efectivo</option>
                                      <option value="TRANSFER">Transferencia</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Tipo</label>
                                    <select value={payType} onChange={e => setPayType(e.target.value)}
                                      className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand">
                                      <option value="self_pay">Self-Pay</option>
                                      <option value="copay">Copago (Cp)</option>
                                      <option value="deductible">Deducible (Ded)</option>
                                      <option value="coinsurance">Coaseguro (Coins)</option>
                                      <option value="no_show">No Show (NS)</option>
                                      <option value="professional_courtesy">Cortesía (Pro Cur)</option>
                                      <option value="collections">Cobranzas (Coll)</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Row 2: Monto / Notas */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">
                                      Monto (USD) <span className="text-amber normal-case">· pendiente: {fmt$(b.balanceDue)}</span>
                                    </label>
                                    <input
                                      type="number" min="0.01" step="0.01"
                                      value={payAmount}
                                      onChange={e => setPayAmount(e.target.value)}
                                      className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-sm font-semibold text-text-1 focus:outline-none focus:border-brand"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Notas (opcional)</label>
                                    <input
                                      type="text"
                                      value={payNotes}
                                      onChange={e => setPayNotes(e.target.value)}
                                      placeholder="Referencia, cheque #, etc."
                                      className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRegisterPayment(b.id)}
                                  disabled={submittingPay || !payAmount || parseFloat(payAmount) <= 0}
                                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-brand/20 border border-brand/40 text-brand text-xs font-semibold hover:bg-brand/25 transition-colors disabled:opacity-50"
                                >
                                  {submittingPay
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Registrando...</>
                                    : <><Check className="w-3.5 h-3.5" /> Confirmar pago</>
                                  }
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-text-muted text-xs text-center py-8">Error al cargar facturación.</div>
              )}
            </div>
          )}

          {/* ─── Footer ──────────────────────────────────────────── */}
          {activeTab === 'detail' && (
            <div className="shrink-0 px-5 py-4 border-t border-border flex flex-col gap-2">
              {cancelOpen ? (
                <div className="rounded-lg border border-rose/30 bg-rose/5 p-3 space-y-2">
                  <p className="text-rose text-xs font-semibold">¿Cancelar esta cita?</p>
                  <p className="text-text-muted text-[11px]">Esta acción no se puede deshacer.</p>
                  {cancelError && <p className="text-rose text-[11px] flex items-center gap-1"><AlertCircle className="w-3 h-3" />{cancelError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setCancelOpen(false); setCancelError(null); }} disabled={cancelling}
                      className="flex-1 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                      Volver
                    </button>
                    <button type="button" onClick={handleCancel} disabled={cancelling}
                      className="flex-1 px-3 py-1.5 rounded-md bg-rose/15 border border-rose/40 text-rose text-xs font-semibold hover:bg-rose/20 transition-colors flex items-center justify-center gap-1.5">
                      {cancelling ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      {cancelling ? 'Cancelando...' : 'Sí, cancelar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button type="button" onClick={() => setCancelOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-rose/30 text-rose hover:bg-rose/10 text-xs font-medium transition-colors sm:mr-auto">
                    <Ban className="w-3.5 h-3.5" /> Cancelar cita
                  </button>
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
                    <button type="button" onClick={handleConfirm} disabled={confirming}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-emerald/15 border border-emerald/40 text-emerald hover:bg-emerald/20 text-xs font-semibold transition-colors disabled:opacity-50">
                      {confirming ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Marcar confirmada
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </DialogContent>
      </Dialog>

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
