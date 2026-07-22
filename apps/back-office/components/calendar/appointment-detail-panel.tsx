'use client';

/**
 * B.11 — AppointmentDetailPanel (modal centrado con tabs)
 *
 * Tab 1: Detalle — info cita, checklist, notas, acciones
 * Tab 2: Servicios — CPT inline typeahead, auto-save
 * Tab 3: Pagos — KPIs del caso + registrar pago inline
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Phone, MessageSquare, RefreshCw, Calendar,
  CheckCircle2, AlertTriangle, ChevronRight, ChevronDown,
  User, Scale, Shield, Headphones, Check, Edit2, Ban,
  AlertCircle, Search, X, Plus, Trash2, DollarSign,
  Stethoscope, Loader2, Clock,
} from 'lucide-react';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { Dialog, DialogContent } from '@precision/ui';
import { AppointmentSecondaryModals, type SecondaryModalType } from './appointment-secondary-modals';
import { AppointmentDialog, type EditAppointmentData } from './appointment-dialog';
import { FinanzasTab } from '@/components/cases/finanzas-tab';

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
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedServiceCodes: list }),
      });
      if (res.ok) {
        setSavedOk(true);
setTimeout(() => setSavedOk(false), 2000);
      }
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
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-border last:border-0 transition-colors ${
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
                    <div key={svc.id} className="grid grid-cols-[60px_1fr_90px_36px] items-center px-3 py-2 border-b border-border last:border-0 hover:bg-bg-2/30 transition-colors">
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
          {activeTab === 'payments' && (
              <div className="flex-1 overflow-y-auto">
                {!appt.case ? (
                  <div className="text-text-muted text-sm text-center py-8">{t('noCaseAssociated')}</div>
                ) : (
                  <FinanzasTab caseId={appt.case.id} />
                )}
              </div>
          )}

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
