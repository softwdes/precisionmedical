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
  Shield, Check, Edit2, Ban,
  AlertCircle, X, Plus, Trash2, DollarSign, Banknote,
  Stethoscope, Loader2, Clock, FolderOpen,
} from 'lucide-react';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, TagPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { EmptyState } from '@/components/ui-phoenix/empty-state';
import { Dialog, DialogContent, DialogTitle, Button } from '@precision/ui';
import { ChargePickerDialog, type BillableItem } from '@/components/visit/charge-picker-dialog';
import { codigosRepetidos, horaCobro } from '@/lib/repeated-charges';
import type { CoverageDTO } from '@/lib/coverage';
import { AppointmentDialog, type EditAppointmentData } from './appointment-dialog';
import { FinanzasTab, type FinanzasTabHandle } from '@/components/cases/finanzas-tab';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { IntakeFormLinkDialog } from '@/components/cases/intake-form-link-dialog';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { ActiveCallBar } from '@/components/cases/active-call-bar';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Forma de cita que consume el panel. Exportada para que las pantallas que lo
 *  montan (calendario, citas del caso) tipen su payload contra ella. */
export interface CalendarAppointment {
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

/** Cargo del catálogo cash — fila real de `appointment_services`. */
interface CashCharge {
  id: string;
  catalogItemId: number | null;
  code: string;
  name: string;
  unitPrice: number;
  unitLabel: string | null;
  cptCode: string | null;
  quantity: number;
  /** Para distinguir dos cobros idénticos del mismo ítem en la lista */
  chargedAt: string;
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
  /**
   * Cobertura del caso. ORDENA qué catálogo abre primero el picker y se muestra
   * ahí como referencia; las dos listas se ven siempre. Sin valor arranca en
   * efectivo — el default más seguro, porque cobrar de más es peor que facturar
   * de menos.
   */
  coverage?: CoverageDTO;
  /**
   * Abre el modal de "Pago del caso" al montarse. Lo usa el botón de cobro del
   * Resumen: cambia al tab de Servicios y el modal aparece solo, en vez de
   * dejar al asistente buscando dónde se paga. El modal vive acá adentro, así
   * que no se puede abrir desde afuera de otra forma — y duplicarlo sería tener
   * dos pantallas de cobro.
   */
  openPaymentsOnMount?: boolean;
  /**
   * Abre el detalle del CASO (labs, servicios, férulas y cobro, todo junto).
   * El panel no sabe a qué URL va: la superficie que lo monta decide si es
   * /front-office/[id] (clínica) o /doctor/case/[id] (portal médico), y ambas
   * lo abren como modal interceptado sobre sí mismas. Sin este callback —o sin
   * caso en la cita— el botón no se muestra.
   */
  onOpenCase?: (caseId: string) => void;
  /**
   * Repliega el modal sin desmontar el componente: se usa mientras el detalle
   * del caso está encima. Al volver, el panel reaparece con su estado intacto
   * (cita seleccionada, llamada en curso, cargos ya cargados). Es lo que evita
   * apilar dos Dialog de Radix que viven en árboles React distintos.
   */
  suspended?: boolean;
}

/** Cobertura sin responder — default cuando el caller no la pasa. */
const COVERAGE_UNSET: CoverageDTO = {
  type: 'UNKNOWN', answered: false, verifyMethod: null, verifiedAt: null,
  verifiedByName: null, carrierName: null, suggestion: null, suggestionSource: null,
};

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

export function AppointmentDetailPanel({ appointment: appt, onClose, onRefresh, initialTab = 'detail', inline = false, noBorder = false, billingTotal, hidePayments = false, coverage = COVERAGE_UNSET, openPaymentsOnMount = false, onOpenCase, suspended = false }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.calendar');
  /** Namespace de los cargos — compartido con el picker. */
  const tc = useTranslations('phoenix.charges');
  const locale = useLocale();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const finanzasRef = useRef<FinanzasTabHandle>(null);

  // ── Detail tab ────────────────────────────────────────────────────────────
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

  // ── Cargos de la visita ───────────────────────────────────────────────────
  //
  // Dos fuentes, una sola lista en pantalla:
  //   · `services`     → CPT de `service_codes`, se factura a la aseguradora.
  //                      Persisten en el JSON `appointment.plannedServiceCodes`.
  //   · `cashCharges`  → ítems de `catalog_items`, los paga el paciente.
  //                      Persisten en la tabla `appointment_services`.
  // Se muestran juntos con badge de fuente y el total se desglosa, porque
  // "$107" mezclando plata de la aseguradora con plata del mostrador no le sirve
  // a nadie: el asistente necesita saber cuánto cobrar HOY.
  const [services,       setServices]       = useState<PlannedService[]>([]);
  const [cashCharges,    setCashCharges]    = useState<CashCharge[]>([]);
  const [svcLoaded,      setSvcLoaded]      = useState(false);
  const [savingSvc,      setSavingSvc]      = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);
  const [confirmDeleteSvc, setConfirmDeleteSvc] = useState<string | null>(null);
  const [confirmVoidCash,  setConfirmVoidCash]  = useState<string | null>(null);

  // ── Picker unificado (los dos catálogos en una búsqueda) ──────────────────
  const [catalogOpen, setCatalogOpen] = useState(false);


  const isFirst   = appt.visitNumber === 0;
  const dt        = formatDateTime(appt.scheduledFor, locale);
  const statusCfgRaw = STATUS_CONFIG[appt.status];
  const statusCfg = { label: statusCfgRaw ? t(statusCfgRaw.tKey as Parameters<typeof t>[0]) : appt.status, state: (statusCfgRaw?.state ?? 'info') as StatusState };
  const intakeDone    = !!appt.case?.intakeFormCompletedAt;
  const lawyerDone    = !!appt.case?.attorney;
  const insuranceDone = !!appt.case?.primaryInsurance;

  // ── Carga de los cargos al abrir el tab ───────────────────────────────────
  // Solo inline: en el modal del calendario los cargos ya no se editan acá,
  // se ven y se cobran en el detalle del caso.
  const servicesVisible = inline && activeTab === 'services';

  // Apertura automática del modal de pago cuando se entra desde el Resumen.
  // `finanzasRef` se puebla al montar el hijo, así que se espera un tick.
  useEffect(() => {
    if (!openPaymentsOnMount || hidePayments || !appt.case) return;
    const id = setTimeout(() => finanzasRef.current?.reloadAndOpen(), 0);
    return () => clearTimeout(id);
  }, [openPaymentsOnMount, hidePayments, appt.case]);

  const loadCashCharges = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cash-services/${appt.id}`);
      if (!res.ok) return;
      const d = (await res.json()) as { charges: CashCharge[] };
      setCashCharges(d.charges ?? []);
    } catch { /* la lista queda como está */ }
  }, [appt.id]);

  useEffect(() => {
    if (!servicesVisible || svcLoaded) return;
    // Los cargos en efectivo siempre se piden: viven en su propia tabla y no
    // vienen en el prop del appointment.
    void loadCashCharges();

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
  }, [servicesVisible, appt.id, svcLoaded, appt.plannedServiceCodes, loadCashCharges]);

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
        await fetch(`/api/admin/appointments/${appt.id}/sync-billing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: appt.case?.id }),
        }).catch(() => {});
        // El Resumen (nodo 4) lee los CPT del payload del SERVER, no de este
        // estado. Sin avisar al padre, el doctor agregaba un servicio y en la
        // salida no aparecía hasta el próximo refresh.
        onRefresh();
      }
    } finally {
      setSavingSvc(false);
    }
  }, [appt.id, appt.case?.id, onRefresh]);

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

  /**
   * Alta desde el picker. La fuente decide DÓNDE se guarda, no cómo se muestra:
   * a seguro va al JSON de la cita (lo lee el HCFA), en efectivo va a su tabla
   * propia con una fila por cargo (dos aplicaciones del mismo inyectable son dos
   * cobros — ver lib/cash-service-billing.ts).
   */
  const addBillable = useCallback(async (item: BillableItem) => {
    if (item.source === 'INSURANCE') {
      addService({
        id: item.refId,
        code: item.code,
        description: item.name,
        fee: item.price,
        category: item.category ?? '',
      });
      return;
    }
    setSavingSvc(true);
    try {
      const res = await fetch(`/api/admin/cash-services/${appt.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItemId: Number(item.refId),
          code: item.code,
          name: item.name,
          unitPrice: item.price,
          cptCode: item.insuranceCode,
          unitLabel: item.unitLabel,
          quantity: 1,
        }),
      });
      if (res.ok) {
        const d = (await res.json()) as { charge: CashCharge };
        setCashCharges(prev => [...prev, d.charge]);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
        // El cargo crea su fila de facturación, así que el saldo del caso que
        // muestra el padre (y el pill ámbar) quedaría viejo.
        onRefresh();
      }
    } finally {
      setSavingSvc(false);
    }
  }, [appt.id, addService, onRefresh]);

  /** Anular, no borrar: el cargo pasó y queda en la auditoría. */
  const voidCashCharge = useCallback(async (id: string) => {
    setSavingSvc(true);
    try {
      const res = await fetch(`/api/admin/cash-services/item/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VOIDED' }),
      });
      if (res.ok) {
        setCashCharges(prev => prev.filter(c => c.id !== id));
        onRefresh();
      }
    } finally {
      setSavingSvc(false);
    }
  }, [onRefresh]);

  // Dos totales, no uno. El "$107" de antes sumaba plata de la aseguradora con
  // plata del mostrador y el asistente tenía que separarla de cabeza.
  const insuranceTotal = services.reduce((s, c) => s + c.fee, 0);
  const cashTotal = cashCharges.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const svcTotal = insuranceTotal + cashTotal;
  const chargeCount = services.length + cashCharges.length;

  const cashRepetidos = codigosRepetidos(cashCharges);

  /** Qué ya está en la visita y cuántas veces, en el formato del picker.
   *  El de efectivo se cuenta porque el mismo ítem puede cobrarse dos veces. */
  const addedCharges = new Map<string, number>();
  for (const s of services) addedCharges.set(`s${s.id}`, 1);
  for (const c of cashCharges) {
    const k = c.catalogItemId !== null ? `c${c.catalogItemId}` : `c-${c.code}`;
    addedCharges.set(k, (addedCharges.get(k) ?? 0) + c.quantity);
  }

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
      {/* Barra de acción — MISMO patrón que los tabs de Férulas y Laboratorios:
          resumen y totales a la izquierda, acción sólida a la derecha. Antes esto
          era un label uppercase + un botón punteado de ancho completo, que no se
          parecía a ningún otro tab de la consulta. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-text-muted">
            {chargeCount === 0
              ? tc('noChargesOnVisit')
              : chargeCount === 1 ? tc('chargeOnVisit') : tc('chargesOnVisit', { count: chargeCount })}
          </span>
          {/* Los dos totales viven ACÁ, siempre a la vista: al fondo de la tabla
              obligaban a scrollear para saber cuánto cobrar en el mostrador. */}
          {insuranceTotal > 0 && (
            <TagPill label={`${tc('totalToInsurance')} ${fmt$(insuranceTotal)}`} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
          )}
          {cashTotal > 0 && (
            <TagPill label={`${tc('totalCashToday')} ${fmt$(cashTotal)}`} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
          )}
          {/* Saldo pendiente del CASO (no de esta visita). Vivía como el número
              grande del header; al pasar los totales de la visita a pills se
              habría perdido, y es el dato que el asistente mira antes de cobrar. */}
          {billingTotal !== undefined && billingTotal > 0 && (
            <TagPill label={`${t('kpiTotalBalance')} ${fmt$(billingTotal)}`} colorClass="bg-amber/15 text-amber border-amber/30" />
          )}
          {savingSvc && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
          {savedOk   && <span className="text-[10px] text-emerald">{t('savedOk')}</span>}
        </div>
        <div className="flex items-center gap-2">
          {appt.case && !hidePayments && (
            <button
              type="button"
              onClick={() => {
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
          {/* Acción primaria del tab, sólida y arriba a la derecha — igual que
              "Dispense brace" en Férulas. */}
          <Button onClick={() => setCatalogOpen(true)} className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {tc('addCharge')}
          </Button>
        </div>
      </div>

      {/* UNA tarjeta con los cargos de la visita, salgan del catálogo que
          salgan, agrupados por quién paga. Antes cada fila llevaba su propio
          badge: con 6 cargos eran 6 pills repetidos diciendo lo mismo. Dos
          encabezados de sección dicen más con menos tinta. */}
      {!svcLoaded ? (
        <div className="flex items-center justify-center py-6 text-text-muted text-xs gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
        </div>
      ) : chargeCount === 0 ? (
        <EmptyState.Rich icon={Stethoscope} title={tc('emptyTitle')} subtitle={tc('emptyHint')} />
      ) : (
        <div className="rounded-lg border border-border bg-bg-1">

          {/* A seguro — el fee ES editable: lo ajusta quien factura */}
          {services.length > 0 && (
            <>
              <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-cyan shrink-0" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                  {tc('badgeInsurance')}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {services.map(svc => (
                  <div key={svc.id} className="px-3 py-2 flex items-center gap-3 hover:bg-bg-2/30 transition-colors">
                    <span className="font-mono text-[11.5px] text-cyan w-[68px] shrink-0">{svc.code}</span>
                    {/* La descripción se lleva el espacio libre: con la grilla de
                        antes le tocaba una fracción y se truncaba siempre. */}
                    <span className="text-[12.5px] text-text-1 flex-1 min-w-[120px]">{svc.description}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={svc.fee}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v !== svc.fee) updateServiceFee(svc.id, v);
                      }}
                      className="w-[78px] shrink-0 text-right tabular-nums bg-transparent border border-transparent hover:border-border focus:border-cyan rounded px-1.5 py-0.5 text-[12.5px] font-semibold text-text-1 focus:outline-none focus:bg-bg-2 transition-colors"
                    />
                    <button type="button" onClick={() => setConfirmDeleteSvc(svc.id)}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-rose/10 text-text-muted hover:text-rose transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* En efectivo — el precio NO se edita acá: es el precio público del
              catálogo. Corregirlo visita por visita es como se pierde el control
              de los márgenes; se arregla en el catálogo, una vez. */}
          {cashCharges.length > 0 && (
            <>
              <div className={`px-3 py-2 border-b border-border/60 flex items-center gap-2 flex-wrap ${services.length > 0 ? 'border-t' : ''}`}>
                <Banknote className="w-3.5 h-3.5 text-emerald shrink-0" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                  {tc('badgeCash')}
                </span>
                {/* La instrucción real para el asistente, no una etiqueta más */}
                <span className="text-[11px] text-text-muted">· {tc('cashCollectedHint')}</span>
              </div>
              <div className="divide-y divide-border/40">
                {cashCharges.map(c => (
                  <div key={c.id} className="px-3 py-2 flex items-center gap-3 hover:bg-bg-2/30 transition-colors">
                    <span className="font-mono text-[11.5px] text-emerald w-[68px] shrink-0 truncate" title={c.code}>{c.code}</span>
                    <span className="text-[12.5px] text-text-1 flex-1 min-w-[120px]">
                      {c.name}
                      {c.quantity > 1 && <span className="text-text-muted"> ×{c.quantity}</span>}
                      {c.unitLabel && <span className="text-text-muted"> · {c.unitLabel}</span>}
                      {/* Solo si el ítem está repetido: dos renglones idénticos
                          no se pueden distinguir a la hora de borrar uno */}
                      {cashRepetidos.has(c.code) && (
                        <span className="text-text-muted"> · {horaCobro(c.chargedAt)}</span>
                      )}
                    </span>
                    <span className="w-[78px] shrink-0 text-right tabular-nums text-[12.5px] font-semibold text-text-1 px-1.5">
                      {fmt$(c.unitPrice * c.quantity)}
                    </span>
                    <button type="button" onClick={() => setConfirmVoidCash(c.id)}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-rose/10 text-text-muted hover:text-rose transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* El desglose ya vive arriba; acá abajo solo el total, que es el dato
              secundario. Solo si hay de las dos fuentes: con una sola, repetiría
              el pill del header. */}
          {insuranceTotal > 0 && cashTotal > 0 && (
            <div className="px-3 py-2.5 border-t border-border/60 text-right">
              <span className="text-[11px] text-text-muted">{t('totalEstimated')}</span>
              <span className="text-[12.5px] font-semibold text-text-1 ml-2 tabular-nums">{fmt$(svcTotal)}</span>
            </div>
          )}
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
               abren su propio modal encima, no un tab a donde navegar.
               Y solo si hay MÁS DE UNO: al filtrar Detalle queda un tab único
               ("Servicios") que repetía el nombre del tab de la pantalla que ya
               lo contiene — una fila subrayada que solo hundía el contenido. ── */}
          {inline && TABS.filter(tab => tab.id !== 'detail').length > 1 && (
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

              {/* UN solo acceso: el detalle del caso. Antes eran dos tarjetas
                  (Servicios y Pagos) que abrían vistas reducidas de esta misma
                  cita; el caso ya trae labs, servicios, férulas y el cobro en un
                  lugar, y es donde el mostrador tiene que estar. Sin caso
                  vinculado no hay a dónde ir, así que no se muestra nada. */}
              {appt.case && onOpenCase && (
                <button
                  type="button"
                  onClick={() => {
                    // sync-billing en background: el caso abre con las líneas de
                    // esta visita ya reflejadas en Finanzas, sin esperar al fetch.
                    fetch(`/api/admin/appointments/${appt.id}/sync-billing`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ caseId: appt.case?.id }),
                    }).catch(() => {});
                    onOpenCase(appt.case!.id);
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-emerald/30 bg-emerald/5 hover:bg-emerald/10 p-4 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald/15 flex items-center justify-center shrink-0">
                    <FolderOpen className="w-4 h-4 text-emerald" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-text-1 font-semibold text-sm">{t('quickAccessCase')}</div>
                    <div className="text-text-muted text-[11px]">{t('quickAccessCaseHint')}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald shrink-0" />
                </button>
              )}

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
                    {/* min-h-11 + margenes negativos: el hit area llega a 44px en
                        mobile (antes 35x15) sin alterar la altura de la fila */}
                    <button type="button" onClick={() => setEditOpen(true)}
                      className="text-[10px] text-brand hover:underline flex items-center gap-1 min-h-11 px-2 -mx-2 -my-2 sm:min-h-0 sm:p-0 sm:m-0">
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

              {/* La fila "Info detallada" (personal · abogado · seguro · quién
                  atendió la llamada) se quitó: eran cuatro modales de solo
                  lectura con recortes de lo que el detalle del caso ya muestra
                  completo, y el botón de arriba lleva justo ahí. */}
            </div>
          )}

          {/* ─── Tab: Servicios (solo inline — en modal no, ver abajo) ──── */}
          {inline && activeTab === 'services' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {servicesBody}
            </div>
          )}

          {/* FinanzasTab oculto — expone el modal "Pagar deuda" al botón del tab
              de Servicios. Solo inline: en el modal del calendario el cobro se
              hace en el detalle del caso, no acá. */}
          {inline && appt.case && !hidePayments && (
            <div className="h-0 overflow-hidden">
              <FinanzasTab ref={finanzasRef} caseId={appt.case.id} filterAppointmentId={appt.id} />
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
                      className="flex-1 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                      {t('actionBack')}
                    </button>
                    <button type="button" onClick={handleCancel} disabled={cancelling}
                      className="flex-1 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md bg-rose/15 border border-rose/40 text-rose text-xs font-semibold hover:bg-rose/20 transition-colors flex items-center justify-center gap-1.5">
                      {cancelling ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      {cancelling ? t('cancellingInProgress') : t('confirmCancelYes')}
                    </button>
                  </div>
                </div>
              ) : (
                /* En sm+ el orden del DOM ya da la jerarquia espacial: destructiva
                   sola a la izquierda (mr-auto) y primaria al extremo derecho. En
                   columna eso se pierde, asi que en mobile se reordena con `order`:
                   primaria arriba, editar, y cancelar al final como link ghost.
                   "Cerrar" se oculta: el Dialog ya tiene su X arriba a la derecha. */
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button type="button" onClick={() => setCancelOpen(true)}
                    className="order-3 sm:order-none flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-0 rounded-md border border-rose/30 text-rose hover:bg-rose/10 text-xs font-medium transition-colors sm:mr-auto">
                    <Ban className="w-3.5 h-3.5" /> {t('actionCancelAppointment')}
                  </button>
                  <button type="button" onClick={() => { twilio.hangUp(); onClose(); }}
                    className="hidden sm:flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                    <X className="w-3.5 h-3.5" /> {t('actionClose')}
                  </button>
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="order-2 sm:order-none flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-0 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> {t('actionEdit')}
                  </button>
                  {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
                    <button type="button" onClick={handleConfirm} disabled={confirming}
                      className="order-1 sm:order-none flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 sm:min-h-0 rounded-md bg-emerald/15 border border-emerald/40 text-emerald hover:bg-emerald/20 text-xs font-semibold transition-colors disabled:opacity-50">
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

      {/* Anular un cargo en efectivo — no se borra la fila, se marca VOIDED:
          el cargo existió y queda en la auditoría. */}
      <ConfirmDialog
        open={confirmVoidCash !== null}
        variant="danger"
        title={tc('voidTitle')}
        description={tc('voidBody')}
        confirmLabel={tc('voidTitle')}
        cancelLabel="Cancel"
        onConfirm={() => { if (confirmVoidCash) void voidCashCharge(confirmVoidCash); setConfirmVoidCash(null); }}
        onCancel={() => setConfirmVoidCash(null)}
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
            isOnline:        appt.isOnline ?? false,
            meetingUrl:      appt.meetingUrl ?? null,
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

      {/* Picker de cargos — una búsqueda sobre los dos catálogos. Solo se abre
          desde el tab de Servicios (inline: consulta del doctor y Day
          Admission); el modal del calendario ya no edita cargos. */}
      {catalogOpen && (
        <ChargePickerDialog
          coverage={coverage}
          added={addedCharges}
          onClose={() => setCatalogOpen(false)}
          onAdd={addBillable}
        />
      )}
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
    // `suspended` repliega el modal mientras el detalle del caso está encima,
    // sin desmontar el componente: al volver reaparece con todo su estado.
    <Dialog open={!suspended} onOpenChange={(v) => { if (!v && !suspended) { twilio.hangUp(); onClose(); } }}>
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

