'use client';
import { localeApp, fecha, fechaHora, fechaCalendario, edad } from '@/lib/fechas';

/**
 * El traductor cuando viaja por parámetro.
 *
 * Hace falta porque los mapas de constantes y los helpers sueltos de este archivo
 * viven fuera de un componente, donde `useTranslations()` no existe. Antes esas
 * cadenas quedaban en español a mano — es la razón por la que el timeline mezclaba
 * idiomas dentro de la misma lista.
 */
type Traductor = (clave: string, vars?: Record<string, string | number | Date>) => string;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Scale, Shield, AlertCircle,
  Send, FileCheck, MessageSquarePlus, Clock, User, Bot, Cpu, FileText,
  PhoneCall, Zap, AlertTriangle, CalendarCheck, Pencil,
  FolderOpen, DollarSign, ClipboardList, Pill, PenLine, CheckCircle2,
  FlaskConical, Briefcase, Bandage, Lock, MessagesSquare,
} from 'lucide-react';
import { Button } from '@precision/ui';
// Los tabs clínicos son ESPEJO de la consulta del doctor (mismo orden e íconos).
// SIN tab Notes: las notas del doctor viven en el Historial Médico del paciente
// (decisión de Erick 2026-08-08) — un tab aparte era redundante.
import { TABS_CON_FILTRO_DE_VISITA, TABS_ATTORNEY, type ActiveTab } from '@/lib/case-tabs';
import { PageHeader, TagPill, PersonAvatar, EntityAvatar, useToast } from '@/components/ui-phoenix';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { CaseMessagesTab } from '@/components/messaging/case-messages-tab';
import { ArchivosDialog, fotosDelCaso } from '@/components/patients/archivos-dialog';
import { ContactoCompartidoNota } from '@/components/patients/contacto-compartido-nota';
import { normalizarIdioma } from '@/lib/portal-message';
import { ConfirmAppointmentDialog } from '@/components/cases/confirm-appointment-dialog';
import { AddNoteDialog } from '@/components/cases/add-note-dialog';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';
import { DocumentsTab } from '@/components/cases/documents-tab';
import { FinanzasTab } from '@/components/cases/finanzas-tab';
import { CitasTab } from '@/components/cases/citas-tab';
import { HistorialMedicoTab } from '@/components/cases/historial-medico-tab';
import { VisitFilter } from '@/components/cases/visit-filter';
import { LienPrintButton } from '@/app/attorney/cases/lien-print';
import { VISIT_PARAM, conTab, conVisitaFiltrada, escribirUrl, paramsDelNavegador } from '@/lib/case-modal-url';
import {
  CaseLabsTab, CaseRxTab, CaseServicesTab, CaseBracesTab, useCaseClinical,
} from '@/components/cases/case-clinical-tabs';

// Front Office · Detalle del caso

type CaseStatus =
  | 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED'
  | 'ACTIVE' | 'MMI' | 'CLOSED' | 'SETTLED' | 'ARCHIVED' | 'CANCELLED';

interface CaseInfo {
  id: string;
  caseCode: string;
  status: CaseStatus;
  caseType: string;
  source: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  accidentNotes: string | null;
  primaryPolicyNumber: string | null;
  secondaryPolicyNumber: string | null;
  intakeFormSentAt: Date | null;
  intakeFormSentVia: string | null;
  intakeFormCompletedAt: Date | null;
  pipVerifiedAt: Date | null;
  firstAppointmentConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: Date | null;
    /** Idioma registrado — decide en qué idioma sale el SMS del portal. */
    preferredLanguage: string | null;
    patientCode: string | null;
    addressLine1: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressZip: string | null;
    socialSecurityNumber: string | null;
    photoUrl: string | null;
    /** Las cuatro fotos de identificación del caso — ver `case-detail-data.ts`. */
    fotos: Record<string, string>;
    /** Contacto compartido en familia — alimenta el cartel bajo el correo/teléfono. */
    contactRelation: string | null;
    sharesEmail: boolean;
    sharesPhone: boolean;
    contactAuthorizedAt: Date | string | null;
    contactOwner: {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
    } | null;
  };
  lawFirm: {
    id: string;
    firmName: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    paymentSpeed: string | null;
    caseflowFlags: string[];
  } | null;
  attorney: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    memberRole: string | null;
  } | null;
  primaryInsurance: {
    id: string;
    name: string;
    shortCode: string;
    color: string;
    type: string;
    responseSpeed: string;
    claimsPhone: string | null;
    hcfaChannel: string;
    preauthRequired: boolean;
  } | null;
  secondaryInsurance: {
    id: string;
    name: string;
    shortCode: string;
    color: string;
    type: string;
  } | null;
  specialty: {
    id: string;
    name: string;
    color: string;
    workflowType: string;
  } | null;
  notes: Array<{
    id: string;
    content: string;
    isPrivate: boolean;
    authorName: string;
    authorUserId: string | null;
    createdAt: Date;
  }>;
  appointments: Array<{
    id: string;
    scheduledFor: Date;
    durationMinutes: number;
    status: string;
    type: string;
  }>;
  lienSignatures: Array<{
    id: string;
    signerType: string;
    signerName: string;
    signerEmail: string | null;
    signatureSvg: string | null;
    signedAt: Date;
    previousCount: number;
  }>;
}

interface AuditEvent {
  id: string;
  action: string;
  actorType: string;
  actorUserId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

interface Props {
  caseInfo: CaseInfo;
  auditEvents: AuditEvent[];
  /**
   * 'admin'  — back-office completo (default).
   * 'doctor' — portal médico: ve lo mismo que la clínica, pero de pagos SOLO
   *            el summary (pagó/no pagó/saldo) — el cobro es del asistente,
   *            misma regla que `hidePayments` en el panel de servicios.
   */
  /** 'attorney' = portal legal: solo lectura y 4 tabs (ver `TABS_ATTORNEY`). */
  variant?: 'admin' | 'doctor' | 'attorney';
  /** Portal legal: el caso todavía no tiene la firma del abogado. Con esto los
   *  documentos quedan cerrados hasta que firme. */
  signatureRequired?: boolean;
  /** Portal legal: abre el diálogo de firma desde el bloqueo de documentos. */
  onRequestSign?: () => void;
  /** Renderizado dentro del modal interceptado — "volver" cierra en vez de navegar */
  inModal?: boolean;
  onClose?: () => void;
  /**
   * Tab con el que abre. Viene del `?tab=` de la URL, así que el mismo enlace
   * aterriza igual sea modal interceptado o página completa tras un refresh.
   * Lo usa el botón del calendario, que abre directo en Laboratorios: ahí
   * empieza la conversación de cuánto se le va a cobrar al paciente.
   */
  initialTab?: ActiveTab;
  /** `users.id` de quien mira — lo pide el tab de Mensajes. */
  currentUserId?: string | null;
}

export function CaseDetailClient({ caseInfo, auditEvents, variant = 'admin', inModal = false, onClose, initialTab, signatureRequired = false, onRequestSign, currentUserId = null }: Props) {
  const isDoctor = variant === 'doctor';
  const isAttorney = variant === 'attorney';
  /** Ni el doctor ni el abogado editan desde acá — cada uno por su motivo. */
  const isReadOnly = isDoctor || isAttorney;
  const t = useTranslations('phoenix.caseDetail');
  // Labels de los tabs clínicos — las MISMAS claves que usa la consulta del
  // doctor, para que digan exactamente lo mismo en los dos lados.
  const td = useTranslations('phoenix.doctor');
  // Firmar/imprimir el lien son acciones del portal legal: sus textos viven ahí.
  const ta = useTranslations('phoenix.attorney');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab ?? 'caso');

  /**
   * El tab también se escribe en la URL, no solo se lee al entrar. Antes se leía
   * el `?tab=` de entrada y nunca se actualizaba: recargabas y volvías al tab
   * con el que habías entrado, no al que estabas mirando.
   */
  const cambiarTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    escribirUrl(conTab(pathname, paramsDelNavegador(), tab));
  }, [pathname]);

  /**
   * Lo clínico se carga UNA vez acá y se reparte a los cinco tabs. Antes cada
   * tab montaba su propio hook y pedía el mismo endpoint por separado.
   */
  const clinical = useCaseClinical(caseInfo.id);

  /**
   * La visita filtrada vive en la URL (`&visit=`), como el caso y el tab: así
   * un refresh — o un link pasado por chat — reproduce exactamente la vista
   * filtrada. `replace` y no `push` porque cambiar un filtro no es un paso de
   * navegación: con push, Atrás iba deshaciendo filtros de a uno.
   */
  const [visitId, setVisitIdState] = useState<string | null>(() => searchParams.get(VISIT_PARAM));
  const setVisitId = useCallback((id: string | null) => {
    setVisitIdState(id);
    escribirUrl(conVisitaFiltrada(pathname, paramsDelNavegador(), id));
  }, [pathname]);
  const [sendPortalOpen, setSendPortalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  /** Fotos de identificación — se abre desde el avatar del paciente. */
  const [archivosOpen, setArchivosOpen] = useState(false);

  /**
   * Los documentos de identidad que todavía no están, con su nombre traducido.
   *
   * Las etiquetas salen de `phoenix.patients` —las mismas que muestra el diálogo
   * de carga— para que recepción lea el mismo nombre en los dos lugares.
   */
  const tp = useTranslations('phoenix.patients');
  const documentosFaltantes = ([
    ['selfie',             'photoSlotSelfie'],
    ['insuranceCardFront', 'photoSlotInsCardFront'],
    ['insuranceCardBack',  'photoSlotInsCardBack'],
    ['dlFront',            'photoSlotDlFront'],
  ] as const)
    .filter(([clave]) => !caseInfo?.patient.fotos?.[clave])
    .map(([, etiqueta]) => tp(etiqueta));
  const toast = useToast();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [markingIntake, setMarkingIntake] = useState(false);

  // Insurance edit modal
  const [insOpen, setInsOpen]           = useState(false);
  const [insQuery, setInsQuery]         = useState('');
  const [insResults, setInsResults]     = useState<Array<{ id: string; name: string; shortCode: string; color: string }>>([]);
  const [insSelected, setInsSelected]   = useState<{ id: string; name: string } | null>(
    caseInfo.primaryInsurance ? { id: caseInfo.primaryInsurance.id, name: caseInfo.primaryInsurance.name } : null
  );
  const [insPolicy, setInsPolicy]       = useState(caseInfo.primaryPolicyNumber ?? '');
  const [insSaving, setInsSaving]       = useState(false);
  /**
   * Error del guardado. Antes no existía: `saveInsurance` no miraba `res.ok`,
   * cerraba el modal y refrescaba igual — si el PATCH fallaba, el usuario veía
   * la pantalla recargarse y se iba creyendo que había guardado.
   */
  const [insError, setInsError]         = useState<string | null>(null);

  // Legal edit modal
  const [legalOpen, setLegalOpen]       = useState(false);
  const [firmQuery, setFirmQuery]       = useState('');
  const [firmResults, setFirmResults]   = useState<Array<{ id: string; firmName: string | null }>>([]);
  const [firmSelected, setFirmSelected] = useState<{ id: string; firmName: string } | null>(
    caseInfo.lawFirm ? { id: caseInfo.lawFirm.id, firmName: caseInfo.lawFirm.firmName ?? '' } : null
  );
  const [attResults, setAttResults]     = useState<Array<{ id: string; firstName: string | null; lastName: string | null }>>([]);
  const [attSelected, setAttSelected]   = useState<{ id: string; firstName: string; lastName: string } | null>(
    caseInfo.attorney ? { id: caseInfo.attorney.id, firstName: caseInfo.attorney.firstName ?? '', lastName: caseInfo.attorney.lastName ?? '' } : null
  );
  const [legalSaving, setLegalSaving]   = useState(false);
  const [legalError, setLegalError]     = useState<string | null>(null);
  const insTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!insOpen) return;
    if (insTimer.current) clearTimeout(insTimer.current);
    insTimer.current = setTimeout(async () => {
      if (insQuery.length < 1) { setInsResults([]); return; }
      const r = await fetch(`/api/admin/insurances/autocomplete?q=${encodeURIComponent(insQuery)}`);
      if (r.ok) {
        const data = await r.json();
        const raw: Array<{ id: string; label: string; shortCode: string; color: string }> = data.results ?? [];
        setInsResults(raw.map(x => ({ id: x.id, name: x.label, shortCode: x.shortCode, color: x.color })));
      }
    }, 200);
    return () => { if (insTimer.current) clearTimeout(insTimer.current); };
  }, [insQuery, insOpen]);

  useEffect(() => {
    if (!legalOpen) return;
    if (firmTimer.current) clearTimeout(firmTimer.current);
    firmTimer.current = setTimeout(async () => {
      if (firmQuery.length < 1) { setFirmResults([]); return; }
      const r = await fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(firmQuery)}`);
      if (r.ok) {
        const data = await r.json();
        const raw: Array<{ id: string; label: string }> = data.results ?? [];
        setFirmResults(raw.map(x => ({ id: x.id, firmName: x.label })));
      }
    }, 200);
    return () => { if (firmTimer.current) clearTimeout(firmTimer.current); };
  }, [firmQuery, legalOpen]);

  useEffect(() => {
    if (!firmSelected) { setAttResults([]); setAttSelected(null); return; }
    fetch(`/api/admin/lawyers/autocomplete?firmId=${firmSelected.id}&q=`)
      .then(r => r.ok ? r.json() : { results: [] })
      .then((data: { results: Array<{ id: string; label: string }> }) => {
        setAttResults(data.results.map(x => {
          const parts = x.label.split(' ');
          return { id: x.id, firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
        }));
      });
  }, [firmSelected]);

  async function saveInsurance() {
    setInsSaving(true);
    setInsError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/update-legal-insurance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryInsuranceId:  insSelected?.id ?? null,
          primaryPolicyNumber: insPolicy.trim() || null,
        }),
      });
      // El modal NO se cierra si falló: cerrarlo es decirle al usuario que quedó
      // guardado, y lo que escribió se perdería sin que se entere.
      if (!res.ok) { setInsError(t('saveFailed')); return; }
      setInsOpen(false);
      router.refresh();
    } catch {
      setInsError(t('saveFailedNetwork'));
    } finally { setInsSaving(false); }
  }

  async function saveLegal() {
    setLegalSaving(true);
    setLegalError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/update-legal-insurance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawFirmId:  firmSelected?.id ?? null,
          attorneyId: attSelected?.id ?? null,
        }),
      });
      if (!res.ok) { setLegalError(t('saveFailed')); return; }
      setLegalOpen(false);
      router.refresh();
    } catch {
      setLegalError(t('saveFailedNetwork'));
    } finally { setLegalSaving(false); }
  }

  const STATUS_META: Record<CaseStatus, { label: string; colorClass: string; icon: string }> = {
    NEW_REFERRAL:     { label: t('statusNewReferral'),      colorClass: 'bg-rose/10 text-rose border-rose/30',         icon: '🔴' },
    INTAKE_PENDING:   { label: t('statusIntakePending'),    colorClass: 'bg-amber/10 text-amber border-amber/30',     icon: '🟡' },
    INTAKE_COMPLETED: { label: t('statusIntakeCompleted'),  colorClass: 'bg-cyan/10 text-cyan border-cyan/30',         icon: '🔵' },
    CONFIRMED:        { label: t('statusConfirmed'),        colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: '🟢' },
    ACTIVE:           { label: t('statusActive'),           colorClass: 'bg-brand/10 text-brand-text border-brand/30',     icon: '⚕️' },
    MMI:              { label: t('statusMmi'),              colorClass: 'bg-violet/10 text-violet-text border-violet/30',  icon: '🏁' },
    CLOSED:           { label: t('statusClosed'),           colorClass: 'bg-bg-2 text-text-2 border-border',           icon: '✓' },
    SETTLED:          { label: t('statusSettled'),          colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: '💰' },
    ARCHIVED:         { label: t('statusArchived'),         colorClass: 'bg-bg-2 text-text-muted border-border',       icon: '📦' },
    CANCELLED:        { label: t('statusCancelled'),        colorClass: 'bg-rose/10 text-rose border-rose/30',         icon: '✗' },
  };

  const st = STATUS_META[caseInfo.status];
  const age = edad(caseInfo.patient.dateOfBirth);

  const handleSimulateIntake = async () => {
    setMarkingIntake(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/mark-intake-complete`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setMarkingIntake(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top nav: back to queue + status */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => {
            // En el modal, "volver" cierra y la lista de Pacientes sigue tal
            // cual quedó (búsqueda, filas expandidas, scroll) — es el motivo
            // de que el detalle exista como modal.
            if (inModal && onClose) { onClose(); return; }
            router.push(isDoctor ? '/doctor/patients' : '/patients');
          }}
          className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToPatients')}
        </button>
        <TagPill label={<span><span className="mr-1">{st.icon}</span>{st.label}</span>} colorClass={st.colorClass} />
      </div>

      {/* Hero · paciente */}
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {/* El avatar es el botón para subir la foto — ver `PersonAvatar`.
                Solo para el staff: el doctor y el abogado leen, no cargan. */}
            <PersonAvatar
              firstName={caseInfo.patient.firstName}
              lastName={caseInfo.patient.lastName}
              size={12}
              gradientClass="bg-gradient-cyan"
              photoUrl={caseInfo.patient.photoUrl}
              onEditPhoto={isReadOnly ? undefined : () => setArchivosOpen(true)}
              editLabel={t('photoEdit')}
            />
            <span>
              <span className="block">{caseInfo.patient.firstName} {caseInfo.patient.lastName}</span>
              <span className="block text-text-muted text-xs font-normal font-mono mt-1">
                {caseInfo.caseCode}
                {caseInfo.patient.patientCode && <span className="ml-2">· {caseInfo.patient.patientCode}</span>}
                {age !== null && <span className="ml-2">· {age} {t('yearsOld')}</span>}
              </span>
            </span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-3 flex-wrap text-sm">
            {caseInfo.patient.phone && (
              <a href={`tel:${caseInfo.patient.phone}`} className="inline-flex items-center gap-1 text-emerald hover:text-text-1 font-mono">
                <Phone className="w-3.5 h-3.5" /> {caseInfo.patient.phone}
              </a>
            )}
            {caseInfo.patient.email && (
              <a href={`mailto:${caseInfo.patient.email}`} className="inline-flex items-center gap-1 text-cyan hover:text-text-1">
                <Mail className="w-3.5 h-3.5" /> {caseInfo.patient.email}
              </a>
            )}
            {/* Editar paciente vive en /patients (ruta de admin) — el doctor
                edita desde su propio módulo y el abogado no edita nada */}
            {!isReadOnly && (
              <Link
                href={`/patients/${caseInfo.patient.id}`}
                className="inline-flex items-center gap-1 text-text-muted hover:text-brand-text text-xs transition-colors"
              >
                <Pencil className="w-3 h-3" /> {t('editPatient')}
              </Link>
            )}
          </span>
        }
        action={isAttorney ? undefined : <ActionButtons status={caseInfo.status} caseId={caseInfo.id} yaAgendada={!!citaYaAgendada(caseInfo)} onSendPortal={() => setSendPortalOpen(true)} onConfirm={() => setConfirmOpen(true)} onSchedule={() => setScheduleOpen(true)} onAddNote={() => setAddNoteOpen(true)} onSimulateIntake={handleSimulateIntake} isMarkingIntake={markingIntake} />}
      />

      {/* Next action banner según status — es una instrucción para el STAFF de
          la clínica ("agendá la primera cita"), no algo que el bufete pueda
          hacer. Mostrárselo le pide una acción que no tiene. */}
      {!isAttorney && <NextActionBanner caseInfo={caseInfo} />}

      {/* Tabs */}
      <div className="relative -mb-2">
        <div className="flex border-b border-border gap-0 overflow-x-auto scrollbar-none">
          {([
            { id: 'caso',           label: t('tabPatient'),      labelShort: t('tabPatient'),      icon: FileText },
            { id: 'citas',          label: t('tabAppointments'), labelShort: t('tabAppointments'), icon: Calendar },
            { id: 'historial',      label: t('tabHistory'),      labelShort: t('tabHistoryShort'), icon: ClipboardList },
            { id: 'labs',           label: td('tabLabs'),        labelShort: td('tabLabs'),        icon: FlaskConical },
            { id: 'rx',             label: td('tabRx'),          labelShort: td('tabRx'),          icon: Pill },
            { id: 'servicios',      label: td('tabServices'),    labelShort: td('tabServices'),    icon: Briefcase },
            { id: 'braces',         label: td('tabBraces'),      labelShort: td('tabBraces'),      icon: Bandage },
            { id: 'finanzas',       label: t('tabFinance'),      labelShort: t('tabFinance'),      icon: DollarSign },
            { id: 'documentos',     label: t('tabDocuments'),    labelShort: t('tabDocumentsShort'), icon: FolderOpen },
            { id: 'mensajes',       label: t('tabMessages'),     labelShort: t('tabMessages'),     icon: MessagesSquare },
          ] as { id: ActiveTab; label: string; labelShort: string; icon: React.ElementType }[])
            // El bufete ve las cuatro pestañas de v2. Las cinco clínicas
            // (historial, labs, rx, servicios, férulas) son del equipo médico y
            // no le corresponden — no es un permiso más, es información que no
            // tiene por qué salir de la clínica.
            .filter(tab => !isAttorney || TABS_ATTORNEY.has(tab.id))
            .map(tab => (
            <button
              key={tab.id}
              onClick={() => cambiarTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-brand text-brand-text'
                  : 'border-transparent text-text-2 hover:text-text-1 hover:border-border'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.labelShort}</span>
            </button>
          ))}
        </div>
        {/* Indicador de scroll derecho */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg-0 to-transparent sm:hidden" />
      </div>

      {/* Tab: Caso ─────────────────────────────────────────────────────────── */}
      {activeTab === 'caso' && (
        <div className="space-y-4">

          {/* ── Fila 1: Paciente + Caso ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Información personal */}
            <InfoCard title={t('personalInfo')} icon={User}>
              <div className="flex items-start gap-4 mb-4">
                <PersonAvatar
                  firstName={caseInfo.patient.firstName}
                  lastName={caseInfo.patient.lastName}
                  size={12}
                  gradientClass="bg-gradient-cyan"
                  photoUrl={caseInfo.patient.photoUrl}
                  onEditPhoto={isReadOnly ? undefined : () => setArchivosOpen(true)}
                  editLabel={t('photoEdit')}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-text-1 font-bold text-base leading-tight">
                    {caseInfo.patient.firstName} {caseInfo.patient.lastName}
                  </div>
                  {caseInfo.patient.patientCode && (
                    <div className="text-text-muted text-[11px] font-mono mt-0.5">{caseInfo.patient.patientCode}</div>
                  )}
                  {/**
                    * El correo y el teléfono, cada uno con su cartel si es
                    * compartido — "es el correo de Luis · su esposo". Van en
                    * columna y no en fila para que el cartel quede pegado al
                    * canal que explica; en fila se leía como si fuera del otro.
                    */}
                  <div className="flex flex-col gap-1.5 mt-2">
                    {caseInfo.patient.email && (
                      <div>
                        <a href={`mailto:${caseInfo.patient.email}`} className="inline-flex items-center gap-1 text-cyan text-xs hover:text-text-1">
                          <Mail className="w-3 h-3" /> {caseInfo.patient.email}
                        </a>
                        <ContactoCompartidoNota patient={caseInfo.patient} canal="EMAIL" />
                      </div>
                    )}
                    {caseInfo.patient.phone && (
                      <div>
                        <a href={`tel:${caseInfo.patient.phone}`} className="inline-flex items-center gap-1 text-emerald text-xs font-mono hover:text-text-1">
                          <Phone className="w-3 h-3" /> {caseInfo.patient.phone}
                        </a>
                        <ContactoCompartidoNota patient={caseInfo.patient} canal="PHONE" />
                      </div>
                    )}
                  </div>
                </div>
                {!isReadOnly && (
                  <Link
                    href={`/patients/${caseInfo.patient.id}`}
                    className="text-text-muted hover:text-brand-text transition-colors shrink-0"
                    title={t('editPatient')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              {/**
                * Qué documentos faltan, y un clic para cargarlos.
                *
                * El paciente ya no puede elegir "los llevo a la cita" en el
                * intake (se retiró el 2026-09-02), pero el paso sigue siendo
                * opcional: hoy 91% de los intakes completados llegan sin una
                * sola foto y solo 4% con la tarjeta de seguro. Sin esa tarjeta
                * antes de la visita no se puede verificar la cobertura, que es
                * el punto de pedirla.
                *
                * Antes esto no se veía en ninguna parte: "sin fotos" no era una
                * señal, era la ausencia de una. Acá queda en la tarjeta que
                * recepción ya mira, con el diálogo de carga a un clic — no en
                * una pantalla aparte que hay que acordarse de abrir.
                *
                * Solo para el staff: el doctor y el abogado leen la ficha.
                */}
              {!isReadOnly && documentosFaltantes.length > 0 && (
                <div className="mb-3 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-start gap-2 flex-wrap">
                  <span className="text-[11px] text-amber leading-relaxed flex-1 min-w-[160px]">
                    {t('docsMissing')}: {documentosFaltantes.join(' · ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setArchivosOpen(true)}
                    className="shrink-0 rounded-md border border-amber/40 bg-amber/10 px-2 py-1 text-[10px] font-semibold text-amber hover:bg-amber/20 transition-colors"
                  >
                    {t('docsMissingAction')}
                  </button>
                </div>
              )}

              <div className="space-y-0">
                {caseInfo.patient.dateOfBirth && (
                  <InfoRow label={t('rowDob')} value={
                    <span>{fechaCalendario(caseInfo.patient.dateOfBirth)}{age !== null ? ` · ${t('ageYears', { age })}` : ''}</span>
                  } />
                )}
                {(caseInfo.patient.addressLine1 || caseInfo.patient.addressCity) && (
                  <InfoRow label={t('rowAddress')} value={
                    <span className="text-text-2 text-xs">
                      {[
                        caseInfo.patient.addressLine1,
                        caseInfo.patient.addressCity,
                        caseInfo.patient.addressState,
                        caseInfo.patient.addressZip,
                      ].filter(Boolean).join(', ')}
                    </span>
                  } />
                )}
                <InfoRow label={t('rowSsn')} value={
                  caseInfo.patient.socialSecurityNumber
                    ? <span className="font-mono text-xs text-text-2">***-**-{caseInfo.patient.socialSecurityNumber.slice(-4)}</span>
                    : <span className="text-text-muted text-sm">—</span>
                } />
              </div>
            </InfoCard>

            {/* Información del caso */}
            <InfoCard title={t('caseInfo')} icon={FileText} onEdit={undefined}>
              {/* Barra de progreso */}
              <CaseProgressBar status={caseInfo.status} />

              <div className="mt-4 space-y-0">
                <InfoRow label={t('rowCaseType')} value={
                  <code className="text-text-1 font-mono text-xs font-bold">{caseInfo.caseType}</code>
                } />
                <InfoRow label={t('fieldSpecialty')} value={
                  caseInfo.specialty ? (
                    <TagPill
                      label={caseInfo.specialty.name}
                      colorClass="bg-bg-2 text-text-2 border-border"
                      compact
                      icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: caseInfo.specialty.color }} />}
                    />
                  ) : <span className="text-text-muted text-sm">—</span>
                } />
                <InfoRow label={t('rowStatus')} value={
                  <TagPill label={st.label} colorClass={st.colorClass} />
                } />
                <InfoRow label={t('rowCreatedAt')} value={fecha(caseInfo.createdAt)} />
                {caseInfo.accidentDate && (
                  <InfoRow label={t('rowAccidentDate')} value={fechaCalendario(caseInfo.accidentDate)} />
                )}
                <InfoRow label={t('rowLawFirm')} value={
                  caseInfo.lawFirm ? (
                    <Link href={`/admin/lawyers/${caseInfo.lawFirm.id}`} className="text-text-1 font-semibold hover:text-brand-text text-sm">
                      {caseInfo.lawFirm.firmName}
                    </Link>
                  ) : <span className="text-text-muted text-sm italic">{t('noFirm')}</span>
                } />
                <InfoRow label={t('rowAttorney')} value={
                  caseInfo.attorney
                    ? <span className="text-text-1 text-sm">{caseInfo.attorney.firstName} {caseInfo.attorney.lastName}</span>
                    : <span className="text-text-muted text-sm italic">{t('notSpecified')}</span>
                } />
                <InfoRow label={t('rowChiropractor')} value={
                  <span className="text-text-muted text-sm italic">{t('notSpecified')}</span>
                } />
                {caseInfo.intakeFormCompletedAt && (
                  <InfoRow label={t('rowIntakeCompleted')} value={fecha(caseInfo.intakeFormCompletedAt)} />
                )}
              </div>
            </InfoCard>
          </div>

          {/* ── Fila 2: Legal + Seguros + Sidebar ────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Legal · Bufete + Firmas */}
            {/* Sin lápiz para el bufete: el portal legal es de LECTURA. Y en
                particular estos dos: el despacho no se edita a sí mismo ni
                toca los datos del seguro. */}
            <InfoCard title={t('sectionLegal')} icon={Scale} onEdit={isReadOnly ? undefined : () => { setFirmQuery(''); setLegalOpen(true); }}>
              {caseInfo.lawFirm ? (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <EntityAvatar name={caseInfo.lawFirm.firmName ?? '?'} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/lawyers/${caseInfo.lawFirm.id}`} className="text-text-1 font-semibold hover:text-brand-text truncate block text-sm">
                        {caseInfo.lawFirm.firmName}
                      </Link>
                      {(caseInfo.lawFirm.city || caseInfo.lawFirm.state) && (
                        <div className="text-text-muted text-[11px] flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {[caseInfo.lawFirm.city, caseInfo.lawFirm.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    {caseInfo.lawFirm.paymentSpeed === 'SLOW' && (
                      <TagPill label={`⚠ ${t('tagSlow')}`} colorClass="bg-amber/15 text-amber border-amber/30" />
                    )}
                  </div>
                  {caseInfo.lawFirm.phone && (
                    <InfoRow label={t('fieldPhone')} value={<span className="font-mono text-xs">{caseInfo.lawFirm.phone}</span>} />
                  )}
                  {caseInfo.lawFirm.caseflowFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {caseInfo.lawFirm.caseflowFlags.map((f) => (
                        <TagPill key={f} label={f} colorClass="bg-brand/10 text-brand-text border-brand/20" mono compact />
                      ))}
                    </div>
                  )}
                  {caseInfo.attorney && (
                    <div className="mt-3 pt-3 border-t border-row-sep">
                      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-2">{t('assignedAttorney')}</div>
                      <div className="flex items-center gap-2">
                        <PersonAvatar firstName={caseInfo.attorney.firstName ?? '?'} lastName={caseInfo.attorney.lastName ?? ''} size={8} />
                        <div className="min-w-0 flex-1">
                          <div className="text-text-1 text-sm">{caseInfo.attorney.firstName} {caseInfo.attorney.lastName}</div>
                          {caseInfo.attorney.email && <div className="text-text-muted text-[11px]">{caseInfo.attorney.email}</div>}
                        </div>
                        {caseInfo.attorney.memberRole && (
                          <TagPill label={caseInfo.attorney.memberRole} colorClass="bg-bg-2 text-text-2 border-border" compact />
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-text-muted text-sm italic">{t('noLawFirm')}</div>
              )}

              {/* Firmas del lien */}
              <div className="mt-3 pt-3 border-t border-row-sep">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2 flex items-center gap-1.5">
                  <PenLine className="w-3 h-3" /> {t('lienSignatures')}
                </div>

                {/* Portal legal: firmar e imprimir viven DONDE están las firmas.
                    Antes había que salir del caso, buscar el menú "..." de la
                    lista y volver — un rodeo para llegar al mismo lugar.
                    El acuerdo solo se puede imprimir una vez firmado: es el
                    mismo criterio que abre el tab de Documentos. */}
                {isAttorney && (
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {signatureRequired && onRequestSign && (
                      <Button size="sm" onClick={onRequestSign}>
                        <PenLine className="w-3.5 h-3.5 mr-1.5" />
                        {ta('lienSignHere')}
                      </Button>
                    )}
                    {/* Imprimir se muestra SIEMPRE, firmado o no. Sin firma abre
                        la previsualización bloqueada — ver LienPrintButton. */}
                    <LienPrintButton
                      caseId={caseInfo.id}
                      locked={signatureRequired}
                      onSign={onRequestSign}
                    />
                  </div>
                )}
                {caseInfo.lienSignatures.length > 0 ? (
                  <div className="space-y-2">
                    {caseInfo.lienSignatures.map((sig) => (
                      <LienSignatureRow key={sig.id} sig={sig} />
                    ))}
                  </div>
                ) : (
                  <div className="text-text-muted text-[11px] italic">{t('noSignatures')}</div>
                )}
              </div>
            </InfoCard>

            {/* Seguros */}
            <InfoCard title={t('sectionInsurance')} icon={Shield} onEdit={isReadOnly ? undefined : () => { setInsQuery(''); setInsOpen(true); }}>
              {caseInfo.primaryInsurance ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-cyan/30 bg-cyan/5 p-3">
                    <div className="flex items-center gap-3">
                      <EntityAvatar code={caseInfo.primaryInsurance.shortCode} color={caseInfo.primaryInsurance.color} />
                      <div className="min-w-0 flex-1">
                        <div className="text-text-1 font-semibold truncate flex items-center gap-1 text-sm">
                          {caseInfo.primaryInsurance.name}
                          {caseInfo.primaryInsurance.responseSpeed === 'SLOW' && (
                            <AlertTriangle className="w-3 h-3 text-amber" />
                          )}
                        </div>
                        <div className="text-text-muted text-[11px]">
                          Primary{etiquetaTipoSeguro(caseInfo.primaryInsurance.type, t) ? ` · ${etiquetaTipoSeguro(caseInfo.primaryInsurance.type, t)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {caseInfo.primaryPolicyNumber && (
                        <div><span className="text-text-muted">{t('policyLabel')}</span> <code className="text-text-1 font-mono">{caseInfo.primaryPolicyNumber}</code></div>
                      )}
                      {/**
                        * El teléfono de reclamos y el pre-auth son datos de
                        * FACTURACIÓN: sirven para perseguir el pago y para saber
                        * si hay que pedir autorización antes de atender. El
                        * bufete no hace ninguna de las dos cosas, así que en su
                        * portal solo agregan ruido a una ficha que además puede
                        * ser de un seguro de salud que no tiene que ver con su
                        * caso. (Decisión de Erick, 2026-09-02.)
                        *
                        * Acá también estaba `HCFA: <canal>`, que se retiró para
                        * TODOS: es el canal por el que Brunella manda el
                        * CMS-1500, y ya vive donde se usa — el catálogo de
                        * aseguradoras (`/admin/insurances`) y el módulo de
                        * facturación. En la ficha del caso no lo lee nadie.
                        */}
                      {!isAttorney && caseInfo.primaryInsurance.claimsPhone && (
                        <div><span className="text-text-muted">{t('claimsLabel')}</span> <span className="text-text-1 font-mono">{caseInfo.primaryInsurance.claimsPhone}</span></div>
                      )}
                      {!isAttorney && caseInfo.primaryInsurance.preauthRequired && (
                        <div className="text-amber">⚠ {t('preauthRequired')}</div>
                      )}
                    </div>
                    <div className="mt-2">
                      {caseInfo.pipVerifiedAt ? (
                        <TagPill label={`✓ ${t('pipVerified')} ${formatRelative(caseInfo.pipVerifiedAt, t)}`} colorClass="bg-emerald/10 text-emerald border-emerald/30" />
                      ) : (
                        <TagPill label={`⏳ ${t('pipNotVerified')}`} colorClass="bg-amber/10 text-amber border-amber/30" />
                      )}
                    </div>
                  </div>
                  {caseInfo.secondaryInsurance && (
                    <div className="rounded-md border border-violet/30 bg-violet/5 p-3">
                      <div className="flex items-center gap-3">
                        <EntityAvatar code={caseInfo.secondaryInsurance.shortCode} color={caseInfo.secondaryInsurance.color} />
                        <div className="min-w-0 flex-1">
                          <div className="text-text-1 font-semibold truncate text-sm">{caseInfo.secondaryInsurance.name}</div>
                          <div className="text-text-muted text-[11px]">
                            Secondary{etiquetaTipoSeguro(caseInfo.secondaryInsurance.type, t) ? ` · ${etiquetaTipoSeguro(caseInfo.secondaryInsurance.type, t)}` : ''}
                          </div>
                        </div>
                      </div>
                      {caseInfo.secondaryPolicyNumber && (
                        <div className="mt-2 text-xs"><span className="text-text-muted">{t('policyLabel')}</span> <code className="text-text-1 font-mono">{caseInfo.secondaryPolicyNumber}</code></div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-text-muted text-sm italic">{t('noPrimaryInsurance')}</div>
              )}
            </InfoCard>

            {/* Timeline + Notas */}
            <div className="space-y-4">
              <Timeline caseInfo={caseInfo} auditEvents={auditEvents} />
              {/* Las notas internas son de la CLÍNICA. El bufete las lee —le
                  sirven para entender el caso— pero no escribe en ellas. */}
              <NotesPanel notes={caseInfo.notes} onAddNote={isReadOnly ? undefined : () => setAddNoteOpen(true)} />
            </div>
          </div>

        </div>
      )}

      {/* Tab: Citas */}
      {activeTab === 'citas' && (
        <CitasTab
          caseId={caseInfo.id}
          caseCode={caseInfo.caseCode}
          patient={{ firstName: caseInfo.patient.firstName, lastName: caseInfo.patient.lastName }}
          specialty={caseInfo.specialty}
          hidePayments={isReadOnly}
          readOnly={isReadOnly}
        />
      )}

      {/* Tab: Historial médico */}
      {activeTab === 'historial' && <HistorialMedicoTab patientId={caseInfo.patient.id} />}

      {/* Tabs clínicos — espejo de la consulta del doctor, agrupados por
          visita y leyendo las fuentes REALES (VisitNote, lab_orders,
          prescriptions de ScriptSure, los dos catálogos de cargos y férulas).
          "Repetir" receta solo en la variante doctor. */}
      {/* Un solo selector de visita para los cinco tabs: la pregunta "qué pasó
          el 5 de agosto" es de la visita, no del tab. Por defecto, todas. */}
      {TABS_CON_FILTRO_DE_VISITA.has(activeTab) && (
        <div className="mb-3">
          <VisitFilter visits={clinical.visits} value={visitId} onChange={setVisitId} />
        </div>
      )}

      {activeTab === 'labs' && (
        <CaseLabsTab caseId={caseInfo.id} patientId={caseInfo.patient.id} clinical={clinical} visitId={visitId} />
      )}
      {activeTab === 'rx' && (
        <CaseRxTab caseId={caseInfo.id} canPrescribe={isDoctor} clinical={clinical} visitId={visitId} />
      )}
      {activeTab === 'servicios' && (
        <CaseServicesTab caseId={caseInfo.id} clinical={clinical} visitId={visitId} />
      )}
      {activeTab === 'braces' && (
        <CaseBracesTab caseId={caseInfo.id} clinical={clinical} visitId={visitId} />
      )}

      {/* Tab: Finanzas */}
      {/* Doctor: solo el summary (pagó/no pagó/saldo) — el cobro es del asistente.
          `filterAppointmentId` ya existía en FinanzasTab (lo usa el panel de la
          cita) y nunca se le pasaba desde el caso: el selector lo aprovecha. */}
      {activeTab === 'finanzas' && (
        <FinanzasTab caseId={caseInfo.id} readOnly={isReadOnly} filterAppointmentId={visitId ?? undefined} />
      )}

      {/* Tab: Documentos */}
      {activeTab === 'documentos' && (
        isAttorney && signatureRequired
          ? <DocumentsLocked onSign={onRequestSign} />
          : <DocumentsTab caseId={caseInfo.id} readOnly={isReadOnly} />
      )}

      {/**
        * Los hilos de mensajería de este caso. El bufete no llega acá —
        * `TABS_ATTORNEY` no incluye 'mensajes'— así que no hace falta gatear por
        * `isAttorney`; el guard es la lista de tabs.
        *
        * Sin `currentUserId` no se monta: el hilo necesita saber quién mira para
        * decidir qué entradas son suyas. Se muestra el aviso en vez de esconder
        * el tab, para que quede claro que es un dato que falta y no una pantalla
        * vacía (la regla de no esconder la acción bloqueada).
        */}
      {activeTab === 'mensajes' && (
        currentUserId ? (
          <CaseMessagesTab
            patientId={caseInfo.patient.id}
            patientName={`${caseInfo.patient.lastName}, ${caseInfo.patient.firstName}`}
            caseId={caseInfo.id}
            currentUserId={currentUserId}
            isAdmin={!isReadOnly}
          />
        ) : (
          <div className="rounded-lg bg-bg-1 p-5">
            <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
              {t('messagesNoUser')}
            </div>
          </div>
        )
      )}

      {/* Modals */}
      {/* Fotos de identificación — lo abre el avatar del paciente */}
      {archivosOpen && (
        <ArchivosDialog
          patientId={caseInfo.patient.id}
          firstName={caseInfo.patient.firstName}
          lastName={caseInfo.patient.lastName}
          fotos={caseInfo.patient.fotos}
          onClose={() => setArchivosOpen(false)}
        />
      )}

      <SendPortalDialog
        open={sendPortalOpen}
        onOpenChange={setSendPortalOpen}
        caseInfo={{
          id: caseInfo.id,
          caseCode: caseInfo.caseCode,
          patient: {
            firstName: caseInfo.patient.firstName,
            lastName: caseInfo.patient.lastName,
            phone: caseInfo.patient.phone,
            email: caseInfo.patient.email,
            // Ver el comentario en front-office-client: sin esto el diálogo abre
            // en español aunque el paciente esté registrado en inglés.
            preferredLanguage: normalizarIdioma(caseInfo.patient.preferredLanguage),
          },
        }}
      />

      <ConfirmAppointmentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        caseInfo={{
          id: caseInfo.id,
          caseCode: caseInfo.caseCode,
          patient: {
            firstName: caseInfo.patient.firstName,
            lastName: caseInfo.patient.lastName,
            phone: caseInfo.patient.phone,
          },
          accidentDate: caseInfo.accidentDate,
          accidentLocation: caseInfo.accidentLocation,
          primaryInsurance: caseInfo.primaryInsurance ? { name: caseInfo.primaryInsurance.name } : null,
          lawFirm: caseInfo.lawFirm?.firmName ? { firmName: caseInfo.lawFirm.firmName } : null,
        }}
      />

      <AddNoteDialog
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        caseId={caseInfo.id}
        caseCode={caseInfo.caseCode}
        // El botón está en el encabezado y se ve desde los nueve tabs, pero las
        // notas se leen solo en el del caso: sin esto, guardar desde Documentos
        // dejaba la pantalla idéntica y parecía que no había guardado nada.
        onSaved={() => {
          toast.success(t('noteSaved'));
          if (activeTab !== 'caso') cambiarTab('caso');
        }}
      />

      <AppointmentDialog
        mode="case"
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        caseInfo={{
          id: caseInfo.id,
          caseCode: caseInfo.caseCode,
          patient: {
            firstName: caseInfo.patient.firstName,
            lastName: caseInfo.patient.lastName,
          },
          specialty: caseInfo.specialty,
        }}
      />

      {/* ── Modal: Editar Seguro ─────────────────────────────────────────────── */}
      {insOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setInsOpen(false)}>
          <div className="bg-bg-1 border border-border rounded-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan" /> {t('editInsurance')}
              </h2>
              <button onClick={() => setInsOpen(false)} className="text-text-muted hover:text-text-1 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">{t('primaryInsurer')}</label>
                {insSelected && (
                  <div className="flex items-center justify-between rounded-md bg-cyan/10 border border-cyan/30 px-3 py-2 mb-2">
                    <span className="text-sm text-text-1">{insSelected.name}</span>
                    <button onClick={() => setInsSelected(null)} className="text-text-muted hover:text-rose text-xs">✕ {t('removeSelected')}</button>
                  </div>
                )}
                <input
                  type="text"
                  value={insQuery}
                  onChange={e => setInsQuery(e.target.value)}
                  placeholder={t('searchInsurer')}
                  className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {insResults.length > 0 && (
                  <div className="mt-1 rounded-md bg-bg-2 shadow-lg shadow-black/30 max-h-40 overflow-y-auto">
                    {insResults.map(ins => (
                      <button key={ins.id} onClick={() => { setInsSelected({ id: ins.id, name: ins.name }); setInsQuery(''); setInsResults([]); }}
                        className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ins.color }} />
                        <span>{ins.name}</span>
                        <span className="text-text-muted text-[10px] font-mono ml-auto">{ins.shortCode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">{t('policyNumber')}</label>
                <input
                  type="text"
                  value={insPolicy}
                  onChange={e => setInsPolicy(e.target.value)}
                  placeholder={t('policyExample')}
                  className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            {insError && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {insError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setInsOpen(false)} disabled={insSaving} className="flex-1">{t('cancel')}</Button>
              <Button size="sm" onClick={saveInsurance} disabled={insSaving} className="flex-1">{insSaving ? t('saving') : t('save')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar Legal ──────────────────────────────────────────────── */}
      {legalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setLegalOpen(false)}>
          <div className="bg-bg-1 border border-border rounded-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-4 h-4 text-brand-text" /> {t('editLegal')}
              </h2>
              <button onClick={() => setLegalOpen(false)} className="text-text-muted hover:text-text-1 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              {/* Firma */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">{t('lawFirm')}</label>
                {firmSelected && (
                  <div className="flex items-center justify-between rounded-md bg-brand/10 border border-brand/30 px-3 py-2 mb-2">
                    <span className="text-sm text-text-1">{firmSelected.firmName}</span>
                    <button onClick={() => { setFirmSelected(null); setAttSelected(null); }} className="text-text-muted hover:text-rose text-xs">✕ {t('removeSelected')}</button>
                  </div>
                )}
                <input
                  type="text"
                  value={firmQuery}
                  onChange={e => setFirmQuery(e.target.value)}
                  placeholder={t('searchFirm')}
                  className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {firmResults.length > 0 && (
                  <div className="mt-1 rounded-md bg-bg-2 shadow-lg shadow-black/30 max-h-40 overflow-y-auto">
                    {firmResults.map(f => (
                      <button key={f.id} onClick={() => { setFirmSelected({ id: f.id, firmName: f.firmName ?? '' }); setFirmQuery(''); setFirmResults([]); }}
                        className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-1">
                        {f.firmName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Abogado */}
              {firmSelected && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">{t('assignedAttorney')}</label>
                  {attResults.length === 0 ? (
                    <p className="text-text-muted text-xs italic">{t('noAttorneysInFirm')}</p>
                  ) : (
                    <div className="rounded-md bg-bg-2 shadow-lg shadow-black/30 max-h-40 overflow-y-auto">
                      <button onClick={() => setAttSelected(null)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-1 ${!attSelected ? 'text-text-1 font-semibold' : 'text-text-muted'}`}>
                        — Sin asignar
                      </button>
                      {attResults.map(a => (
                        <button key={a.id} onClick={() => setAttSelected({ id: a.id, firstName: a.firstName ?? '', lastName: a.lastName ?? '' })}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-1 ${attSelected?.id === a.id ? 'text-brand-text font-semibold' : 'text-text-1'}`}>
                          {a.firstName} {a.lastName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {legalError && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {legalError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setLegalOpen(false)} disabled={legalSaving} className="flex-1">{t('cancel')}</Button>
              <Button size="sm" onClick={saveLegal} disabled={legalSaving} className="flex-1">{legalSaving ? t('saving') : t('save')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Action buttons en header ──────────────────────────────────────────────────

function ActionButtons({
  status,
  caseId,
  onSendPortal,
  onConfirm,
  onSchedule,
  onAddNote,
  onSimulateIntake,
  isMarkingIntake,
  yaAgendada,
}: {
  status: CaseStatus;
  caseId: string;
  /** El caso ya tiene una cita no cancelada — ver `citaYaAgendada`. */
  yaAgendada: boolean;
  onSendPortal: () => void;
  onConfirm: () => void;
  onSchedule: () => void;
  onAddNote: () => void;
  onSimulateIntake: () => void;
  isMarkingIntake: boolean;
}) {
  const t = useTranslations('phoenix.caseDetail');
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === 'NEW_REFERRAL' && (
        <Button onClick={onSendPortal} size="sm">
          <Send className="w-3.5 h-3.5 mr-1" /> {t('btnSendForms')}
        </Button>
      )}
      {status === 'INTAKE_PENDING' && (
        <>
          <Button onClick={onSendPortal} variant="outline" size="sm">
            <Send className="w-3.5 h-3.5 mr-1" /> {t('btnResendForms')}
          </Button>
          <Button onClick={onSimulateIntake} variant="outline" size="sm" disabled={isMarkingIntake}>
            <Zap className="w-3.5 h-3.5 mr-1" />
            {isMarkingIntake ? t('btnSimulating') : t('btnSimulateForms')}
          </Button>
        </>
      )}
      {status === 'INTAKE_COMPLETED' && (
        <>
          <Button onClick={onConfirm} size="sm">
            <FileCheck className="w-3.5 h-3.5 mr-1" /> {t('btnConfirmAppointment')}
          </Button>
          <Button onClick={onSendPortal} variant="outline" size="sm">
            <Send className="w-3.5 h-3.5 mr-1" /> {t('btnResendForms')}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => window.open(`/front-office/${caseId}/intake-print`, '_blank')}
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> {t('viewIntake')}
          </Button>
        </>
      )}
      {status === 'CONFIRMED' && (
        <>
          {/* "Agendar primera cita" solo cuando no hay ninguna. Con la cita ya
              puesta el botón proponía como acción principal algo ya hecho, y el
              tab Citas —a un clic— ya la muestra. Agendar otra sale del
              calendario, que es donde se ve la agenda entera. */}
          {!yaAgendada && (
            <Button onClick={onSchedule} size="sm">
              <CalendarCheck className="w-3.5 h-3.5 mr-1" /> {t('btnScheduleFirst')}
            </Button>
          )}
          <Button onClick={onSendPortal} variant="outline" size="sm">
            <Send className="w-3.5 h-3.5 mr-1" /> {t('btnResendForms')}
          </Button>
        </>
      )}
      <Button onClick={onAddNote} variant="outline" size="sm">
        <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> {t('btnAddNote')}
      </Button>
    </div>
  );
}

// ─── Next action banner ────────────────────────────────────────────────────────

/**
 * El tipo de aseguradora, en palabras — o `null` cuando no dice nada.
 *
 * La tarjeta mostraba el enum crudo: "Primary · OTHER". Y no es un caso raro:
 * de los 953 casos con aseguradora primaria, **636 son `OTHER`** (218 de las 303
 * aseguradoras del catálogo quedaron con ese tipo). O sea que la etiqueta más
 * frecuente de esa línea era literalmente la palabra "otro".
 *
 * `OTHER` devuelve `null` y la línea queda solo con "Primary": decir "Otro" no
 * agrega nada, y peor, disfraza de dato lo que es un campo sin llenar.
 *
 * ── Por qué esto NO se le pregunta al paciente ──────────────────────────────
 *
 * El tipo vive en `InsuranceCarrier.type`, no en el caso: es una propiedad de la
 * COMPAÑÍA (State Farm es de auto, Select Health es de salud), se carga una vez
 * en el catálogo (`/admin/insurances`) y vale para todos los casos que la usen.
 * Nadie tiene que saber qué es PIP para que esta etiqueta salga bien — y menos
 * el paciente, que nunca ve ni toca este campo.
 *
 * Los 636 en `OTHER` son entonces un problema de carga del catálogo, no de la
 * pantalla. Esta función los deja MÁS visibles (la línea queda corta), que es lo
 * que corresponde: es un dato que falta, no un dato que existe.
 */
function etiquetaTipoSeguro(tipo: string, t: (k: string) => string): string | null {
  switch (tipo) {
    case 'PIP':     return t('insTypePip');
    case 'MED_PAY': return t('insTypeMedPay');
    case 'HEALTH':  return t('insTypeHealth');
    case 'WORKERS': return t('insTypeWorkers');
    default:        return null; // OTHER, y cualquier valor nuevo del enum
  }
}

/**
 * La cita ya agendada de un caso, si tiene alguna.
 *
 * Se descartan las CANCELADAS: una cita cancelada no ocupa la agenda ni cuenta
 * como agendada — mismo criterio que el resto del sistema (ver la regla de
 * archivar paciente). Se devuelve la más próxima en el tiempo.
 *
 * Existe porque el banner y los botones de acción se decidían SOLO por
 * `case.status`, sin mirar las citas. Con status CONFIRMED siempre decían
 * "agendá la primera cita", incluso en un caso que ya tenía una agendada con
 * provider, clínica y horario — que es como suele quedar, porque el alta desde
 * la llamada agenda la cita en el mismo paso. Reportado el 2026-09-02.
 */
function citaYaAgendada(caseInfo: CaseInfo): { scheduledFor: Date } | null {
  const vivas = caseInfo.appointments
    .filter((a) => a.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  return vivas[0] ?? null;
}

function NextActionBanner({ caseInfo }: { caseInfo: CaseInfo }) {
  const t = useTranslations('phoenix.caseDetail');
  const locale = localeApp();
  const cita = citaYaAgendada(caseInfo);

  const cfg: Record<CaseStatus, { title: string; message: string; tone: 'rose' | 'amber' | 'cyan' | 'emerald' | 'brand' } | null> = {
    NEW_REFERRAL:     { title: t('bannerNewReferralTitle'), message: t('bannerNewReferralMsg'), tone: 'rose' },
    INTAKE_PENDING:   { title: t('bannerIntakePendingTitle'), message: t('bannerIntakePendingMsg'), tone: 'amber' },
    INTAKE_COMPLETED: { title: t('bannerIntakeCompletedTitle'), message: t('bannerIntakeCompletedMsg'), tone: 'cyan' },
    // Con la cita ya puesta, "agendá la primera cita" es una instrucción para
    // algo que ya está hecho. Se dice qué hay y cuál es el paso que sigue.
    CONFIRMED:        cita
      ? { title: t('bannerScheduledTitle'), message: t('bannerScheduledMsg', { cuando: fechaHora(cita.scheduledFor, locale) }), tone: 'emerald' }
      : { title: t('bannerConfirmedTitle'), message: t('bannerConfirmedMsg'), tone: 'emerald' },
    ACTIVE:           { title: t('bannerActiveTitle'), message: t('bannerActiveMsg'), tone: 'brand' },
    MMI:              null,
    CLOSED:           null,
    SETTLED:          null,
    ARCHIVED:         null,
    CANCELLED:        null,
  };
  const banner = cfg[caseInfo.status];
  if (!banner) return null;

  const toneClasses: Record<typeof banner.tone, string> = {
    rose:    'bg-rose/5 border-rose/30 text-rose',
    amber:   'bg-amber/5 border-amber/30 text-amber',
    cyan:    'bg-cyan/5 border-cyan/30 text-cyan',
    emerald: 'bg-emerald/5 border-emerald/30 text-emerald',
    brand:   'bg-brand/5 border-brand/30 text-brand-text',
  };

  return (
    <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${toneClasses[banner.tone]}`}>
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{banner.title}</div>
        <div className="text-text-2 text-xs mt-0.5">{banner.message}</div>
      </div>
    </div>
  );
}

// ─── CaseProgressBar ──────────────────────────────────────────────────────────

/**
 * Las etiquetas van como CLAVE, no como texto.
 *
 * Este mapa vive a nivel de módulo, y ahí no existe `useTranslations()` — por eso
 * estas cinco sobrevivieron en español mientras el resto del archivo se traducía.
 * La clave se resuelve en el render, que sí tiene el hook.
 */
const PROGRESS_STAGES: Array<{ key: CaseStatus[]; labelKey: string }> = [
  { key: ['NEW_REFERRAL'],                                labelKey: 'stageRegistro' },
  { key: ['INTAKE_PENDING', 'INTAKE_COMPLETED'],          labelKey: 'stageIntake' },
  { key: ['CONFIRMED'],                                   labelKey: 'stageFirstAppt' },
  { key: ['ACTIVE', 'MMI'],                               labelKey: 'stageFollowUp' },
  { key: ['CLOSED', 'SETTLED', 'ARCHIVED', 'CANCELLED'],  labelKey: 'stageClosed' },
];

function CaseProgressBar({ status }: { status: CaseStatus }) {
  const t = useTranslations('phoenix.caseDetail');
  const activeIdx = PROGRESS_STAGES.findIndex((s) => s.key.includes(status));
  const isCancelled = status === 'CANCELLED';

  return (
    <div className="mb-1">
      <div className="flex items-center gap-0">
        {PROGRESS_STAGES.map((stage, i) => {
          const isDone    = i < activeIdx;
          const isActive  = i === activeIdx;
          const isLast    = i === PROGRESS_STAGES.length - 1;

          let dotColor    = 'bg-border';
          let lineColor   = 'bg-border';
          let labelColor  = 'text-text-muted';

          if (isCancelled && isLast) {
            dotColor   = 'bg-rose';
            labelColor = 'text-rose';
          } else if (isDone) {
            dotColor  = 'bg-emerald';
            lineColor = 'bg-emerald';
          } else if (isActive) {
            dotColor   = 'bg-brand';
            labelColor = 'text-brand-text font-semibold';
          }

          return (
            <React.Fragment key={stage.labelKey}>
              <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
                <div className={`w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-bg-1 z-10`} />
                <span className={`text-[9px] mt-1 whitespace-nowrap ${labelColor}`}>{t(stage.labelKey)}</span>
              </div>
              {!isLast && (
                <div className={`h-px flex-1 ${lineColor} mt-[-10px]`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── InfoCard + InfoRow ────────────────────────────────────────────────────────

function InfoCard({ title, icon: Icon, children, onEdit }: { title: string; icon: React.ElementType; children: React.ReactNode; onEdit?: () => void }) {
  const t = useTranslations('phoenix.caseDetail');
  return (
    <div className="rounded-lg bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-brand-text" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex-1">{title}</h3>
        {onEdit && (
          <button onClick={onEdit} className="p-1 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors" title={t('edit')}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 items-start py-1.5 border-b border-row-sep last:border-0">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="sm:col-span-2 text-sm text-text-1">{value}</div>
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({ caseInfo, auditEvents }: { caseInfo: CaseInfo; auditEvents: AuditEvent[] }) {
  const t = useTranslations('phoenix.caseDetail');

  // Combinar audit events + key milestones del case en un solo feed
  type Event = {
    id: string;
    title: string;
    detail?: string;
    icon: React.ElementType;
    iconColor: string;
    at: Date;
    actor: string;
    actorType: 'HUMAN_USER' | 'AI_AGENT' | 'SYSTEM';
  };

  const SOURCE_LABELS: Record<string, string> = {
    // Legacy / sistema interno
    LAW_FIRM_REFERRAL:  t('sourceLabelLawFirm'),
    WEB_FORM:           t('sourceLabelWebForm'),
    AI_AGENT:           t('sourceLabelAiAgent'),
    // Valores actuales del wizard
    LAW_FIRM:           t('sourceLabelLawFirm'),
    PATIENT_REFERRAL:   t('sourceLabelPatient'),
    CHIROPRACTOR:       t('sourceLabelChiropractor'),
    REFERRAL:           t('sourceLabelReferral'),
    PHONE_CALL:         t('sourceLabelPhoneCall'),
    WALK_IN:            t('sourceLabelWalkIn'),
    ACCIDENT_CENTER:    t('sourceLabelAccidentCenter'),
    WEB_SEARCH:         t('sourceLabelWebSearch'),
    GOOGLE:             t('sourceLabelGoogle'),
    GOOGLE_MAPS:        t('sourceLabelGoogleMaps'),
    FACEBOOK:           t('sourceLabelFacebook'),
    INSTAGRAM:          t('sourceLabelInstagram'),
    TIKTOK:             t('sourceLabelTikTok'),
    WEBSITE:            t('sourceLabelWebsite'),
    CLINIC_STAFF:       t('sourceLabelClinicStaff'),
    INSURANCE:          t('sourceLabelInsurance'),
    MEDICAL_INSURANCE:  t('sourceLabelMedicalInsurance'),
    FAMILY:             t('sourceLabelFamily'),
    OTHER:              t('sourceLabelOther'),
  };

  const events: Event[] = [];

  // Always: created
  events.push({
    id: 'created',
    title: t('timelineCaseCreated'),
    detail: SOURCE_LABELS[caseInfo.source] ?? caseInfo.source,
    icon: PhoneCall,
    iconColor: 'text-brand-text',
    at: caseInfo.createdAt,
    actor: t('timelineActorFrontOffice'),
    actorType: 'HUMAN_USER',
  });

  auditEvents.forEach((e) => {
    const cfg = AUDIT_ACTION_CFG[e.action];
    if (!cfg) return;
    events.push({
      id: e.id,
      title: t(cfg.titleKey),
      detail: cfg.detail?.(e.metadata, t),
      icon: cfg.icon,
      iconColor: cfg.iconColor,
      at: e.createdAt,
      actor: e.actorUserId ?? (e.actorType === 'SYSTEM' ? t('timelineActorSystem') : t('timelineActorFrontOffice')),
      actorType: e.actorType as 'HUMAN_USER' | 'AI_AGENT' | 'SYSTEM',
    });
  });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="rounded-lg bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-brand-text" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('timeline')}</h3>
        <span className="text-text-muted text-xs font-mono ml-auto">{events.length} {t('timelineEvents')}</span>
      </div>
      {events.length === 0 ? (
        <div className="text-text-muted text-sm italic">{t('timelineEmpty')}</div>
      ) : (
        <div className="space-y-3">
          {events.map((e, idx) => {
            const ActorIcon = e.actorType === 'AI_AGENT' ? Bot : e.actorType === 'SYSTEM' ? Cpu : User;
            return (
              <div key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-7 h-7 rounded-full bg-bg-2 border border-border flex items-center justify-center ${e.iconColor}`}>
                    <e.icon className="w-3.5 h-3.5" />
                  </div>
                  {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 20 }} />}
                </div>
                <div className="flex-1 min-w-0 pb-3">
                  <div className="text-text-1 text-sm font-medium">{e.title}</div>
                  {e.detail && <div className="text-text-2 text-xs mt-0.5">{e.detail}</div>}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
                    <ActorIcon className="w-3 h-3" />
                    <span>{e.actor}</span>
                    <span>·</span>
                    <span>{formatRelative(e.at, t)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Config del timeline por acción auditada.
 *
 * `titleKey` y no `title`, y `detail` recibe el traductor: este mapa está a nivel
 * de módulo y ahí no hay `useTranslations()`. Por eso los seis títulos quedaron
 * en español mientras el resto del archivo se traducía, y por eso el timeline
 * mostraba "Case created" (que viene por otro camino) junto a "Caso creado desde
 * llamada" en la misma lista.
 *
 * Los `detail` que solo concatenan datos —nombre del doctor, clínica, fecha— no
 * necesitan traducción: no tienen palabras propias.
 */
const AUDIT_ACTION_CFG: Record<string, {
  titleKey: string;
  detail?: (metadata: Record<string, unknown> | null, t: Traductor) => string | undefined;
  icon: React.ElementType;
  iconColor: string;
}> = {
  CREATE_CASE_FROM_CALL: {
    titleKey: 'tlCaseFromCall',
    icon: PhoneCall,
    iconColor: 'text-brand-text',
  },
  SEND_PORTAL_LINK: {
    titleKey: 'tlPortalSent',
    detail: (m, t) => m
      ? t('tlPortalSentDetail', { via: String(m.via ?? '?'), language: String(m.language ?? '?') })
      : undefined,
    icon: Send,
    iconColor: 'text-cyan',
  },
  MARK_INTAKE_COMPLETE_DEV: {
    titleKey: 'tlPortalDevDone',
    detail: (_m, t) => t('tlPortalDevDoneDetail'),
    icon: FileText,
    iconColor: 'text-amber',
  },
  CONFIRM_FIRST_APPOINTMENT: {
    titleKey: 'tlFirstApptConfirmed',
    detail: (m, t) => {
      if (!m?.checklist) return undefined;
      const c = m.checklist as Record<string, boolean>;
      return t('tlChecklistDetail', { done: Object.values(c).filter(Boolean).length });
    },
    icon: FileCheck,
    iconColor: 'text-emerald',
  },
  SCHEDULE_FIRST_APPOINTMENT: {
    titleKey: 'tlFirstApptScheduled',
    // Solo datos concatenados: no hay texto que traducir.
    detail: (m) => {
      if (!m) return undefined;
      const provider = m.providerName as string | undefined;
      const clinic = m.clinicName as string | undefined;
      const when = m.scheduledFor as string | undefined;
      const parts: string[] = [];
      if (provider) parts.push(provider);
      if (clinic) parts.push(clinic);
      if (when) parts.push(new Date(when).toLocaleString(localeApp(), { dateStyle: 'medium', timeStyle: 'short' }));
      return parts.length > 0 ? parts.join(' · ') : undefined;
    },
    icon: CalendarCheck,
    iconColor: 'text-brand-text',
  },
  INSERT_CASE_NOTE: {
    titleKey: 'tlNoteAdded',
    detail: (m) => m?.contentPreview ? `"${String(m.contentPreview).slice(0, 50)}..."` : undefined,
    icon: MessageSquarePlus,
    iconColor: 'text-violet-text',
  },
};

// ─── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({ notes, onAddNote }: {
  notes: CaseInfo['notes'];
  /** Sin handler no se dibuja el botón — el portal legal solo lee las notas. */
  onAddNote?: () => void;
}) {
  const t = useTranslations('phoenix.caseDetail');
  return (
    <div className="rounded-lg bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquarePlus className="w-4 h-4 text-brand-text" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('sectionInternalNotes')}</h3>
        <span className="text-text-muted text-xs font-mono ml-auto">{notes.length}</span>
      </div>
      {onAddNote && (
        <Button onClick={onAddNote} variant="outline" size="sm" className="w-full mb-3">
          <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> {t('btnAddNote')}
        </Button>
      )}
      {notes.length === 0 ? (
        <div className="text-text-muted text-xs italic text-center py-4">{t('notesEmpty')}</div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto scroll-thin pr-1">
          {notes.map((n) => (
            <div key={n.id} className="rounded-md bg-bg-2/40 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] text-text-muted mb-1">
                <span className="font-semibold text-text-2">{n.authorName}</span>
                <span>·</span>
                <span>{formatRelative(n.createdAt, t)}</span>
                {n.isPrivate && <TagPill label={`🔒 ${t('notePrivate')}`} colorClass="bg-bg-1 text-text-muted border-border" compact />}
              </div>
              <div className="text-text-1 text-xs whitespace-pre-wrap leading-relaxed">{n.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────────

/** El traductor entra por parámetro: esto es una función suelta, sin hook. */
function formatRelative(d: Date | string, t: Traductor): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) return t('relMinutes', { n: Math.max(1, Math.floor(h * 60)) });
  if (h < 24) return t('relHours', { n: Math.floor(h) });
  if (h < 24 * 7) return t('relDays', { n: Math.floor(h / 24) });
  return new Date(d).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric' });
}

// ─── LienSignatureRow ──────────────────────────────────────────────────────────

const SIGNER_LABELS: Record<string, string> = {
  PATIENT:  'Paciente',
  ATTORNEY: 'Abogado',
  DOCTOR:   'Provider',
};

const SIGNER_COLORS: Record<string, string> = {
  PATIENT:  'bg-cyan/10 border-cyan/30 text-cyan',
  ATTORNEY: 'bg-brand/10 border-brand/30 text-brand-text',
  DOCTOR:   'bg-violet/10 border-violet/30 text-violet-text',
};

function LienSignatureRow({
  sig,
}: {
  sig: { id: string; signerType: string; signerName: string; signerEmail: string | null; signatureSvg: string | null; signedAt: Date; previousCount: number };
}) {
  const t = useTranslations('phoenix.caseDetail');
  const [expanded, setExpanded] = useState(false);
  const colorClass = SIGNER_COLORS[sig.signerType] ?? 'bg-bg-2 border-border text-text-2';
  const label = SIGNER_LABELS[sig.signerType] ?? sig.signerType;

  const imgSrc = sig.signatureSvg
    ? (sig.signatureSvg.startsWith('data:') ? sig.signatureSvg : `data:image/png;base64,${sig.signatureSvg}`)
    : null;

  return (
    <div className="rounded-md bg-bg-2/40 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>{label}</span>
            <span className="text-sm text-text-1 font-medium truncate">{sig.signerName}</span>
            {sig.signerEmail && (
              <span className="text-[11px] text-text-muted truncate hidden sm:inline">{sig.signerEmail}</span>
            )}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
            <span>{t('signedAt')} {new Date(sig.signedAt).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {sig.previousCount > 0 && (
              <span className="font-sans px-1.5 py-0.5 rounded border border-amber/30 bg-amber/10 text-amber">
                {sig.previousCount === 1 ? t('signatureReplacedOne') : t('signatureReplacedMany', { count: sig.previousCount })}
              </span>
            )}
          </div>
        </div>
        {imgSrc && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-brand-text hover:text-text-1 transition-colors shrink-0 font-medium"
          >
            {expanded ? t('hideSignature') : t('viewSignature')}
          </button>
        )}
      </div>
      {imgSrc && (
        <div className="px-3 py-3 bg-slate-900/80">
          <img
            src={imgSrc}
            alt={`Firma de ${sig.signerName}`}
            className={`w-full object-contain rounded transition-all duration-200 ${expanded ? 'max-h-48' : 'max-h-16 opacity-70'}`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Portal Legal · documentos cerrados hasta que el abogado firme.
 *
 * Es el ÚNICO bloqueo real del portal: el caso siempre se puede ver (eso solo
 * dispara una advertencia), pero los documentos exigen la firma. Se muestra el
 * motivo y el botón para firmar en el mismo lugar — mandarlo a buscar el menú
 * "..." de la lista sería hacerle dar una vuelta para llegar acá de nuevo.
 */
function DocumentsLocked({ onSign }: { onSign?: () => void }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  return (
    <div className="rounded-lg bg-bg-1 p-10 text-center">
      <Lock className="w-8 h-8 text-amber mx-auto mb-3" />
      <div className="text-text-1 font-semibold text-sm">{t('documentsLockedTitle')}</div>
      <div className="text-text-2 text-xs mt-1 max-w-sm mx-auto">{t('documentsLockedBody')}</div>
      {onSign && (
        <Button className="mt-4" onClick={onSign}>
          <PenLine className="w-3.5 h-3.5 mr-1.5" />
          {t('signNow')}
        </Button>
      )}
    </div>
  );
}
