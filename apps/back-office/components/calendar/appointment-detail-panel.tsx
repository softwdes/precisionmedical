'use client';

/**
 * B.11 — AppointmentDetailPanel (modal centrado con tabs)
 *
 * Tab 1: Detalle — info cita, checklist, notas, acciones
 * Tab 2: Servicios — CPT inline typeahead, auto-save
 * Tab 3: Pagos — KPIs del caso + registrar pago inline
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Phone, MessageSquare, Calendar,
  CheckCircle2, AlertTriangle, ChevronRight, ChevronDown,
  User, Scale, Shield, Headphones, Check, Edit2, Ban,
  AlertCircle, Search, X, Plus, Trash2, DollarSign,
  Stethoscope, Loader2, Clock, Star,
} from 'lucide-react';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { AppointmentSecondaryModals, type SecondaryModalType } from './appointment-secondary-modals';
import { AppointmentDialog, type EditAppointmentData } from './appointment-dialog';
import { FinanzasTab, type FinanzasTabHandle } from '@/components/cases/finanzas-tab';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { IntakeFormLinkDialog } from '@/components/cases/intake-form-link-dialog';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { ActiveCallBar } from '@/components/cases/active-call-bar';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  visitNumber: number;
  isOnline?: boolean;
  meetingUrl?: string | null;
  plannedServiceCodes?: PlannedService[];
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

/** Fila del catálogo completo (modal de búsqueda) — trae isFavorite, a diferencia de PlannedService */
interface CatalogService extends PlannedService {
  isFavorite: boolean;
}

interface Props {
  appointment: CalendarAppointment;
  onClose: () => void;
  onRefresh: () => void;
  initialTab?: Tab;
  inline?: boolean;
  noBorder?: boolean;
  billingTotal?: number;
  /**
   * Portal médico: el doctor ordena servicios pero NO cobra — oculta el botón
   * "Pagar deuda" y su modal. El cobro lo hace el asistente en Day Admission.
   */
  hidePayments?: boolean;
}

type Tab = 'detail' | 'services';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string, locale = 'en-US') {
  const d  = new Date(iso);
  const tz = 'America/Denver';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const year = get('year'), mon = get('month'), day = get('day');
  const hr = get('hour'), min = get('minute');
  const h12 = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz });
  const dayName = d.toLocaleDateString(locale, { weekday: 'short', timeZone: tz });
  const date = d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
  return {
    date,
    time: h12,
    dayName,
    dateInput: `${year}-${mon}-${day}`,
    timeInput: `${hr === '24' ? '00' : hr}:${min}`,
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

export function AppointmentDetailPanel({ appointment: appt, onClose, onRefresh, initialTab = 'detail', inline = false, noBorder = false, billingTotal, hidePayments = false }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.calendar');
  const locale = useLocale();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const finanzasRef = useRef<FinanzasTabHandle>(null);
  // En modo NO inline, "Servicios" abre como modal sobre el Detalle (como
  // Pagos ya hacia) en vez de navegar a otro tab — en inline (embebido en
  // consulta/admision) sigue siendo un tab de verdad, sin modal de por medio.
  const [servicesModalOpen, setServicesModalOpen] = useState(false);

  // ── Detail tab ────────────────────────────────────────────────────────────
  const [activeModal,   setActiveModal]   = useState<SecondaryModalType | null>(null);
  const [confirming,    setConfirming]    = useState(false);
  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelError,   setCancelError]   = useState<string | null>(null);
  const [editOpen,       setEditOpen]       = useState(false);
  const [intakeLinkOpen, setIntakeLinkOpen] = useState(false);
  const [callConfirmOpen, setCallConfirmOpen] = useState(false);

  // ── Llamada real por Twilio (mismo hook/widget que new-case-dialog) ──────
  const twilio = useTwilioDevice();
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (twilio.callStatus !== 'in-call') { setCallElapsed(0); return; }
    const id = setInterval(() => setCallElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [twilio.callStatus]);

  // El CallLog ya lo crea el webhook de Twilio apenas conecta (outcome/
  // duracion los pone otro webhook mas) — esto solo lo vincula al paciente/
  // caso para que aparezca con nombre en Metricas > Comunicaciones en vez de
  // solo el numero de telefono (mismo vinculo que ya hace new-case-dialog.tsx).
  useEffect(() => {
    if (!twilio.callSid) return;
    fetch('/api/twilio/link-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twilioCallSid: twilio.callSid, patientId: appt.patient.id, caseId: appt.case?.id ?? null }),
    }).catch(() => {});
  }, [twilio.callSid, appt.patient.id, appt.case?.id]);

  // ── Services (modal A: lo ya agregado a esta cita) ────────────────────────
  const [services,       setServices]       = useState<PlannedService[]>([]);
  const [svcLoaded,      setSvcLoaded]      = useState(false);
  const [savingSvc,      setSavingSvc]      = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);
  const [confirmDeleteSvc, setConfirmDeleteSvc] = useState<string | null>(null);

  // ── Catálogo de servicios (modal B: buscar/agregar, con favoritos) ────────
  const [catalogOpen,         setCatalogOpen]         = useState(false);
  const [serviceSearch,       setServiceSearch]       = useState('');
  const [serviceResults,      setServiceResults]      = useState<CatalogService[]>([]);
  const [searchingSvc,        setSearchingSvc]        = useState(false);
  const [catalogFavoritesOnly, setCatalogFavoritesOnly] = useState(false);
  const [catalogPage,         setCatalogPage]         = useState(1);
  const [catalogTotalPages,   setCatalogTotalPages]   = useState(1);
  const [togglingFavId,       setTogglingFavId]       = useState<string | null>(null);


  const isFirst   = appt.visitNumber === 0;
  const dt        = formatDateTime(appt.scheduledFor, locale);
  const statusCfgRaw = STATUS_CONFIG[appt.status];
  const statusCfg = { label: statusCfgRaw ? t(statusCfgRaw.tKey as Parameters<typeof t>[0]) : appt.status, state: (statusCfgRaw?.state ?? 'info') as StatusState };
  const intakeDone    = !!appt.case?.intakeFormCompletedAt;
  const lawyerDone    = !!appt.case?.attorney;
  const insuranceDone = !!appt.case?.primaryInsurance;

  // ── Load services when tab/modal opens ────────────────────────────────────
  const servicesVisible = inline ? activeTab === 'services' : servicesModalOpen;
  useEffect(() => {
    if (!servicesVisible || svcLoaded) return;
    // Si el appointment ya trae los servicios en el prop, usarlos directamente
    if (appt.plannedServiceCodes) {
      setServices(appt.plannedServiceCodes);
      setSvcLoaded(true);
      return;
    }
    fetch(`/api/admin/appointments/${appt.id}`)
      .then(r => r.json())
      .then(d => {
        setServices((d.plannedServiceCodes as PlannedService[]) ?? []);
        setSvcLoaded(true);
      })
      .catch(() => setSvcLoaded(true));
  }, [servicesVisible, appt.id, svcLoaded, appt.plannedServiceCodes]);

  // Volver a página 1 cuando cambia la búsqueda o el filtro de favoritos
  useEffect(() => { setCatalogPage(1); }, [serviceSearch, catalogFavoritesOnly]);

  // ── Catálogo (modal B) — con la caja vacía ya muestra un listado navegable
  // (favoritos primero, orden por defecto), no hace falta escribir nada
  // primero. Al escribir, filtra igual; paginado real de a 10.
  useEffect(() => {
    if (!catalogOpen) return;
    const delay = serviceSearch ? 300 : 0;
    const timer = setTimeout(() => {
      setSearchingSvc(true);
      const params = new URLSearchParams({ page: String(catalogPage) });
      if (serviceSearch) params.set('search', serviceSearch);
      if (catalogFavoritesOnly) params.set('favoritesOnly', 'true');
      fetch(`/api/admin/service-codes?${params}`)
        .then(r => r.json())
        .then(d => {
          setServiceResults(d.codes ?? []);
          setCatalogTotalPages(d.totalPages ?? 1);
        })
        .catch(() => {})
        .finally(() => setSearchingSvc(false));
    }, delay);
    return () => clearTimeout(timer);
  }, [serviceSearch, catalogOpen, catalogPage, catalogFavoritesOnly]);

  const toggleCatalogFavorite = useCallback(async (svc: CatalogService) => {
    setTogglingFavId(svc.id);
    // optimista — se revierte si falla
    setServiceResults(prev => prev.map(s => s.id === svc.id ? { ...s, isFavorite: !s.isFavorite } : s));
    try {
      const res = await fetch(`/api/admin/services/${svc.id}/favorite`, { method: svc.isFavorite ? 'DELETE' : 'POST' });
      if (!res.ok) throw new Error('failed');
    } catch {
      setServiceResults(prev => prev.map(s => s.id === svc.id ? { ...s, isFavorite: svc.isFavorite } : s));
    } finally {
      setTogglingFavId(null);
    }
  }, []);

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
        // Sync billing records (one per CPT service)
        fetch(`/api/admin/appointments/${appt.id}/sync-billing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: appt.case?.id }),
        }).catch(() => {});
      }
    } finally {
      setSavingSvc(false);
    }
  }, [appt.id]);

  const addService = useCallback((svc: PlannedService) => {
    if (services.find(s => s.id === svc.id)) return;
    const next = [...services, { id: svc.id, code: svc.code, description: svc.description, fee: svc.fee, category: svc.category }];
    setServices(next);
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
  ];

  // Contenido de Servicios — se usa tanto embebido (inline, ej. consulta del
  // doctor) como dentro del modal que se abre desde el boton "Servicios" del
  // Detalle, para no duplicar la logica de busqueda/lista en dos lugares.
  const servicesBody = (
    <>
      {/* Header con total + Pagar deuda */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionCptServices')}</div>
        <div className="flex items-center gap-2">
          {savingSvc && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
          {savedOk   && <span className="text-[10px] text-emerald">{t('savedOk')}</span>}
          <span className="text-sm font-bold text-cyan">{fmt$(billingTotal ?? svcTotal)}</span>
          {appt.case && !hidePayments && (
            <button
              type="button"
              onClick={() => {
                // Cerramos este modal antes de abrir el de pago — son dos overlays
                // independientes (Dialog vs. el modal propio de FinanzasTab) y
                // apilarlos se veía mal (doble fondo oscurecido, bordes encimados).
                if (!inline) setServicesModalOpen(false);
                // sync-billing en background — no bloqueamos apertura del modal
                fetch(`/api/admin/appointments/${appt.id}/sync-billing`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ caseId: appt.case?.id }),
                }).catch(() => {});
                finanzasRef.current?.reloadAndOpen();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 transition-colors">
              <DollarSign className="w-3.5 h-3.5" /> {t('actionPayDebt')}
            </button>
          )}
        </div>
      </div>

      {/* Agregar servicio — abre el catálogo completo (modal B) */}
      <button
        type="button"
        onClick={() => setCatalogOpen(true)}
        className="w-full flex items-center gap-2 justify-center rounded-lg border border-dashed border-cyan/40 text-cyan hover:bg-cyan/5 py-2.5 text-sm font-semibold transition-colors"
      >
        <Plus className="w-4 h-4" /> {t('actionAddService')}
      </button>

      {/* Lista de servicios ya agregados a esta cita */}
      {!svcLoaded ? (
        <div className="flex items-center justify-center py-6 text-text-muted text-xs gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
        </div>
      ) : services.length === 0 ? (
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
            <div key={svc.id} className="grid grid-cols-[60px_1fr_90px_36px] items-center px-3 py-2 border-b border-row-sep last:border-0 hover:bg-bg-2/30 transition-colors">
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
              <button type="button" onClick={() => setConfirmDeleteSvc(svc.id)}
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
    </>
  );

  // Contenido del catálogo (modal B) — buscar/filtrar/paginar y agregar a
  // la cita. Favoritos primero por defecto (⭐ toggle real, ver
  // UserServiceFavorite / B.33 — no es decorativo).
  const catalogBody = (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={serviceSearch}
            onChange={e => setServiceSearch(e.target.value)}
            placeholder={t('searchServicePlaceholder')}
            className="w-full bg-bg-2 border border-border rounded-lg pl-9 pr-9 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-cyan transition-colors"
          />
          {serviceSearch && (
            <button type="button" onClick={() => setServiceSearch('')}
              className="absolute right-3 top-2.5 text-text-muted hover:text-text-1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCatalogFavoritesOnly(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0 ${
            catalogFavoritesOnly ? 'bg-amber/15 border-amber/40 text-amber' : 'border-border text-text-2 hover:bg-white/5'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${catalogFavoritesOnly ? 'fill-amber' : ''}`} /> {t('favoritesOnly')}
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[32px_60px_1fr_80px_90px] text-[10px] uppercase tracking-wider text-text-muted font-semibold px-3 py-2 bg-bg-2/50 border-b border-border/50">
          <span />
          <span>{t('colCode')}</span>
          <span>{t('colDescription')}</span>
          <span className="text-right">{t('colCost')}</span>
          <span className="text-right">{t('colAction')}</span>
        </div>
        {searchingSvc ? (
          <div className="flex items-center justify-center py-8 text-text-muted text-xs gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('searching')}
          </div>
        ) : serviceResults.length === 0 ? (
          <div className="px-3 py-8 text-center text-text-muted text-xs">{t('noResultsFor', { query: serviceSearch })}</div>
        ) : (
          serviceResults.map(svc => {
            const already = !!services.find(s => s.id === svc.id);
            return (
              <div key={svc.id} className="grid grid-cols-[32px_60px_1fr_80px_90px] items-center px-3 py-2 border-b border-row-sep last:border-0 hover:bg-bg-2/30 transition-colors">
                <button type="button" onClick={() => toggleCatalogFavorite(svc)} disabled={togglingFavId === svc.id}
                  title={svc.isFavorite ? t('removeFavorite') : t('addFavorite')}
                  className="flex items-center justify-center text-text-muted hover:text-amber transition-colors disabled:opacity-40">
                  <Star className={`w-3.5 h-3.5 ${svc.isFavorite ? 'fill-amber text-amber' : ''}`} />
                </button>
                <span className="font-mono text-[11px] text-cyan">{svc.code}</span>
                <span className="text-xs text-text-1 pr-2 truncate">{svc.description}</span>
                <span className="text-xs font-semibold text-text-2 text-right">{fmt$(svc.fee)}</span>
                <div className="flex justify-end">
                  <button type="button" onClick={() => !already && addService(svc)} disabled={already}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      already ? 'bg-emerald/15 text-emerald cursor-not-allowed' : 'bg-cyan text-black hover:bg-cyan/90'
                    }`}>
                    {already ? t('added') : t('select')}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {catalogTotalPages > 1 && (
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>{t('pageOf', { page: catalogPage, total: catalogTotalPages })}</span>
          <div className="flex gap-2">
            <button type="button" disabled={catalogPage <= 1} onClick={() => setCatalogPage(p => p - 1)}
              className="px-3 py-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors">
              {t('previous')}
            </button>
            <button type="button" disabled={catalogPage >= catalogTotalPages} onClick={() => setCatalogPage(p => p + 1)}
              className="px-3 py-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors">
              {t('next')}
            </button>
          </div>
        </div>
      )}
    </>
  );

  const panelContent = (
    <>

          {/* ─── Header (solo en modal, no inline) ──────────────── */}
          {/* pr-9 en vez de pr-5: el botón de cerrar (X) del Dialog vive
              aparte, absolute right-4, y sin este espacio extra quedaba
              pegado al StatusPill. */}
          {!inline && (
            <div className="flex items-center justify-between pl-5 pr-9 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-cyan" />
                <div>
                  <div className="text-text-1 font-semibold text-sm">{dt.dayName} {dt.date}</div>
                  <div className="text-text-muted text-xs">{dt.time} <span className="opacity-50 text-[10px]">MT</span> · {appt.durationMinutes} min</div>
                </div>
              </div>
              <StatusPill label={statusCfg.label} state={statusCfg.state} />
            </div>
          )}

          {/* ─── Tabs — solo existen en modo inline. En el modal completo,
               Detalle es la unica vista y Servicios/Pagos son botones que
               abren su propio modal encima, no un tab a donde navegar. ── */}
          {inline && (
          <div className="flex border-b border-border shrink-0">
            {TABS.filter(tab => tab.id !== 'detail').map(tab => (
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
          )}

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

              {/* Accesos directos a Servicios y Pagos — bien visibles, no escondidos
                  atrás de un tab que pasaba desapercibido. Un clic y se ve el
                  contenido (Servicios cambia de tab; Pagos abre el modal real). */}
              <div className={`grid grid-cols-1 ${appt.case && !hidePayments ? 'sm:grid-cols-2' : ''} gap-3`}>
                <button
                  type="button"
                  onClick={() => setServicesModalOpen(true)}
                  className="flex items-center gap-3 rounded-lg border border-cyan/30 bg-cyan/5 hover:bg-cyan/10 p-4 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-cyan/15 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-4 h-4 text-cyan" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-text-1 font-semibold text-sm">{t('tabServices')}</div>
                    <div className="text-text-muted text-[11px]">{t('quickAccessServicesHint')}</div>
                  </div>
                </button>

                {appt.case && !hidePayments && (
                  <button
                    type="button"
                    onClick={() => {
                      fetch(`/api/admin/appointments/${appt.id}/sync-billing`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ caseId: appt.case?.id }),
                      }).catch(() => {});
                      finanzasRef.current?.reloadAndOpen();
                    }}
                    className="flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 hover:bg-amber/10 p-4 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber/15 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4 text-amber" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-text-1 font-semibold text-sm">{t('quickAccessPayments')}</div>
                      <div className="text-text-muted text-[11px]">{t('quickAccessPaymentsHint')}</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Info de la cita + Checklist pre-cita — lado a lado en pantallas anchas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-bg-1 p-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📅 {t('sectionAppointmentInfo')}</div>
                  <div className="space-y-2 text-[12.5px]">
                    <Row label={t('rowDateAndTime')}  value={`${dt.dayName} ${dt.date} · ${dt.time} MT`} highlight />
                    {appt.isOnline && (
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="text-text-muted text-[11px] w-24 shrink-0">{t('rowOnline')}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan/15 border border-cyan/30 text-cyan font-semibold">📹 {t('onlineBadge')}</span>
                          {appt.meetingUrl && (
                            <a href={appt.meetingUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-cyan underline truncate max-w-[160px]">
                              {t('joinMeeting')}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <Row label={t('rowDuration')}      value={`${appt.durationMinutes} min`} />
                    <Row label={t('rowClinic')}        value={appt.clinic.name} />
                    {appt.provider && <Row label={t('rowDoctor')} value={`${t('drPrefix')} ${appt.provider.firstName} ${appt.provider.lastName}`} />}
                    {appt.provider?.specialty && <Row label={t('rowSpecialty')} value={SPECIALTY_LABEL[appt.provider.specialty] ?? appt.provider.specialty} />}
                    <Row label={t('rowType')} value={TYPE_LABEL[appt.type] ?? appt.type} chip chipColor={appt.type === 'AUTO_ACCIDENT' ? 'rose' : 'emerald'} />
                    {appt.case?.accidentDate && (
                      <Row label={t('rowAccidentDate')}
                        value={new Date(appt.case.accidentDate).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'America/Denver' })} highlight />
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-bg-1 p-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">🎯 {t('sectionPreVisitStatus')}</div>
                  <div className="space-y-2">
                    <CheckItem done={intakeDone}    label={t('checklistIntakeForm')}             sublabel={intakeDone ? t('checklistCompleted') : t('checklistIntakePending')} />
                    <CheckItem done={lawyerDone}    label={t('checklistLawyerVerified')}         sublabel={lawyerDone ? (appt.case?.attorney?.firmName ?? (`${appt.case?.attorney?.firstName ?? ''} ${appt.case?.attorney?.lastName ?? ''}`.trim() || '—')) : t('checklistNoLawyer')} />
                    <CheckItem done={insuranceDone} label={t('checklistInsuranceVerified')}      sublabel={insuranceDone ? (appt.case?.primaryInsurance?.name ?? '—') : t('checklistInsurancePending')} />
                    <CheckItem done={appt.status === 'CONFIRMED'} label={t('checklistConfirmationCall')} sublabel={appt.status === 'CONFIRMED' ? t('checklistCallConfirmed') : t('checklistCallNotDone')} />
                  </div>
                </div>
              </div>

              {/* Notas + Acciones rápidas — lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

                <div className="rounded-lg border border-border bg-bg-1 p-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📞 {t('sectionQuickActions')}</div>

                  {(twilio.callStatus === 'connecting' || twilio.callStatus === 'in-call') && (
                    <div className="mb-2">
                      <ActiveCallBar
                        status={twilio.callStatus}
                        patientName={`${appt.patient.firstName} ${appt.patient.lastName}`}
                        phone={appt.patient.phone ?? ''}
                        elapsed={callElapsed}
                        muted={twilio.muted}
                        onMuteToggle={twilio.toggleMute}
                        onHangUp={twilio.hangUp}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {appt.patient.phone && (
                      <button
                        type="button"
                        disabled={twilio.callStatus === 'connecting' || twilio.callStatus === 'in-call'}
                        onClick={() => setCallConfirmOpen(true)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-emerald/10 hover:border-emerald/40 text-text-2 hover:text-emerald transition-colors text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Phone className="w-4 h-4" /> {t('actionCall')}
                      </button>
                    )}
                    {appt.patient.phone && (
                      <a href={`sms:${appt.patient.phone}`}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                        <MessageSquare className="w-4 h-4" /> {t('actionSms')}
                      </a>
                    )}
                    {appt.case && (
                      <button
                        type="button"
                        onClick={() => setIntakeLinkOpen(true)}
                        title={intakeDone ? t('resendFormDoneHint') : undefined}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors text-[11px] font-medium ${
                          intakeDone
                            ? 'border-emerald/30 bg-emerald/5 text-emerald hover:bg-emerald/10'
                            : 'border-border text-text-2 hover:bg-white/5 hover:text-text-1'
                        }`}
                      >
                        {intakeDone ? <CheckCircle2 className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        {intakeDone ? t('checklistCompleted') : t('actionResendForm')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Info detallada — 4 en fila con el ancho nuevo */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📂 {t('sectionDetailedInfo')}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <SecondaryBtn icon={<User className="w-4 h-4" />}       label={t('secondaryBtnPersonal')}    color="brand"   onClick={() => setActiveModal('personal')} />
                  <SecondaryBtn icon={<Scale className="w-4 h-4" />}      label={t('secondaryBtnLawyer')}      color="rose"    done={lawyerDone}    onClick={() => setActiveModal('lawyer')} />
                  <SecondaryBtn icon={<Shield className="w-4 h-4" />}     label={t('secondaryBtnInsurance')}   color="emerald" done={insuranceDone} onClick={() => setActiveModal('insurance')} />
                  <SecondaryBtn icon={<Headphones className="w-4 h-4" />} label={t('secondaryBtnCallHandler')} color="cyan"    onClick={() => setActiveModal('callHandler')} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Tab: Servicios (solo inline — en modal no, ver abajo) ──── */}
          {inline && activeTab === 'services' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {servicesBody}
            </div>
          )}

          {/* FinanzasTab oculto — expone modal "Pagar deuda" al botón del header */}
          {appt.case && !hidePayments && (
            <div className="h-0 overflow-hidden">
              <FinanzasTab ref={finanzasRef} caseId={appt.case.id} />
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
                  <button type="button" onClick={() => { twilio.hangUp(); onClose(); }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                    <X className="w-3.5 h-3.5" /> {t('actionClose')}
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

      {/* Confirm delete service */}
      <ConfirmDialog
        open={confirmDeleteSvc !== null}
        variant="danger"
        title="Remove service"
        description="Are you sure you want to remove this service from the appointment? This action cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => { if (confirmDeleteSvc) removeService(confirmDeleteSvc); setConfirmDeleteSvc(null); }}
        onCancel={() => setConfirmDeleteSvc(null)}
      />

      {/* Confirm call — llamar de verdad es una accion real (Twilio), no solo abrir un link */}
      <ConfirmDialog
        open={callConfirmOpen}
        variant="info"
        title={t('confirmCallTitle', { name: `${appt.patient.firstName} ${appt.patient.lastName}` })}
        description={t('confirmCallDescription', { phone: appt.patient.phone ?? '' })}
        confirmLabel={t('confirmCallAccept')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => { setCallConfirmOpen(false); twilio.connect(appt.patient.phone!); }}
        onCancel={() => setCallConfirmOpen(false)}
      />

      {/* Secondary modals */}
      {activeModal && (
        <AppointmentSecondaryModals
          type={activeModal}
          appointment={appt}
          onClose={() => setActiveModal(null)}
        />
      )}

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
            clinicName:      appt.clinic.name,
            providerId:      appt.provider?.id ?? null,
            providerFirstName: appt.provider?.firstName,
            providerLastName:  appt.provider?.lastName,
            providerSpecialty: appt.provider?.specialty ?? undefined,
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

      {/* Reenviar formulario — link real + QR (mismo flujo que Day Admission) */}
      {appt.case && (
        <IntakeFormLinkDialog
          open={intakeLinkOpen}
          onOpenChange={setIntakeLinkOpen}
          caseInfo={{
            id:       appt.case.id,
            caseCode: appt.case.caseCode,
            patient: {
              firstName: appt.patient.firstName,
              lastName:  appt.patient.lastName,
              phone:     appt.patient.phone,
              email:     appt.patient.email,
            },
          }}
        />
      )}

      {/* Servicios como modal sobre el Detalle (no inline) — un clic y se ve
          ahí mismo, sin navegar a otro tab (mismo criterio que Pagos, que ya
          abre su propio modal desde FinanzasTab). */}
      {!inline && (
        <Dialog open={servicesModalOpen} onOpenChange={setServicesModalOpen}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
            <DialogTitle className="sr-only">{t('tabServices')}</DialogTitle>
            <div className="px-5 py-4 border-b border-border shrink-0 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-cyan" />
              <h2 className="text-text-1 font-semibold text-base">{t('tabServices')}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {servicesBody}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Catálogo de servicios (modal B) — se abre desde "Agregar servicio",
          tanto en modo inline (consulta del doctor) como en el modal de
          Detalle, por eso no está condicionado por `inline`. */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogTitle className="sr-only">{t('actionAddService')}</DialogTitle>
          <div className="px-5 py-4 border-b border-border shrink-0 flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan" />
            <h2 className="text-text-1 font-semibold text-base">{t('actionAddService')}</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {catalogBody}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (inline) {
    return (
      <div className={`flex flex-col overflow-hidden rounded-lg bg-bg-1 max-h-[600px] ${noBorder ? '' : 'border border-border'}`}>
        {panelContent}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { twilio.hangUp(); onClose(); } }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">Appointment detail</DialogTitle>
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
