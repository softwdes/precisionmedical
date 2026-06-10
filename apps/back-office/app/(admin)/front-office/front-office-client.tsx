'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Phone, PhoneCall, FileText, Mail, Send, ChevronRight, Plus, Calendar, Building2, FileCheck, Zap, CalendarCheck, Search, X, ArrowUpDown } from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  FilterPill,
  TagPill,
  EmptyState,
  PersonAvatar,
} from '@/components/ui-phoenix';
import { NewCaseDialog, type NewCaseInitialState } from '@/components/cases/new-case-dialog';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { ConfirmAppointmentDialog } from '@/components/cases/confirm-appointment-dialog';
import { ScheduleAppointmentDialog } from '@/components/cases/schedule-appointment-dialog';
import { IncomingCallSimulator, IncomingCallToast, type IncomingCallData } from '@/components/cases/incoming-call-simulator';

// B.1 — Front Office · Recepción primaria

type CaseStatus =
  | 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED'
  | 'ACTIVE' | 'MMI' | 'CLOSED' | 'SETTLED' | 'ARCHIVED' | 'CANCELLED';

interface PhoenixCase {
  id: string;
  caseCode: string;
  status: CaseStatus;
  source: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  patient: {
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: Date | null;
  };
  lawFirm: { firmName: string; paymentSpeed: string | null } | null;
  attorney: { firstName: string | null; lastName: string | null } | null;
  primaryInsurance: {
    name: string;
    shortCode: string;
    color: string;
    responseSpeed: string;
  } | null;
  specialty: { name: string; color: string } | null;
  intakeFormSentAt: Date | null;
  intakeFormSentVia: string | null;
  intakeFormCompletedAt: Date | null;
  pipVerifiedAt: Date | null;
  firstAppointmentConfirmedAt: Date | null;
  appointmentCount: number;
  noteCount: number;
  createdAt: Date;
}

interface Props {
  cases: PhoenixCase[];
  stats: Record<CaseStatus, number>;
  specialties: Array<{ id: string; name: string; color: string }>;
  clinics: Array<{ id: string; name: string; address: string | null }>;
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
  samplePatients: Array<{
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    casesCount: number;
  }>;
}

export function FrontOfficeClient({ cases, stats, specialties, clinics, providers, samplePatients }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.frontOffice');
  const [filter, setFilter] = useState<'all' | CaseStatus>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'urgency' | 'dol' | 'created'>('urgency');
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseInitial, setNewCaseInitial] = useState<NewCaseInitialState | null>(null);
  const [sendPortalCase, setSendPortalCase] = useState<PhoenixCase | null>(null);
  const [confirmCase, setConfirmCase] = useState<PhoenixCase | null>(null);
  const [scheduleCase, setScheduleCase] = useState<PhoenixCase | null>(null);
  const [markingIntake, setMarkingIntake] = useState<string | null>(null);

  // ─── Filtrado + búsqueda + orden ─────────────────────────────────────────
  // Record<string, number> (no CaseStatus) para no fallar si llega ACTIVE u otro status futuro
  const STATUS_PRIORITY: Record<string, number> = {
    NEW_REFERRAL:     4,  // urgente: hay que contactar al paciente
    INTAKE_COMPLETED: 3,  // urgente: llamar 24h antes para confirmar
    INTAKE_PENDING:   2,  // esperando que paciente complete portal
    CONFIRMED:        1,  // listo: solo falta agendar
    ACTIVE:           0,  // ya agendado · no debería aparecer aquí pero safe
  };

  const filtered = cases
    .filter((c) => {
      // Filtro de status
      if (filter !== 'all' && c.status !== filter) return false;
      // Búsqueda por texto
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.patient.firstName.toLowerCase().includes(q) ||
        c.patient.lastName.toLowerCase().includes(q) ||
        `${c.patient.firstName} ${c.patient.lastName}`.toLowerCase().includes(q) ||
        (c.patient.phone ?? '').toLowerCase().replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
        c.caseCode.toLowerCase().includes(q) ||
        (c.lawFirm?.firmName ?? '').toLowerCase().includes(q) ||
        (c.accidentLocation ?? '').toLowerCase().includes(q) ||
        (c.patient.email ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'urgency') {
        const diff = (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
        if (diff !== 0) return diff;
        // Desempate: más antiguo primero dentro del mismo status
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'dol') {
        // DOL más reciente primero (accidente reciente = más urgente en PI)
        const da = a.accidentDate ? new Date(a.accidentDate).getTime() : 0;
        const db = b.accidentDate ? new Date(b.accidentDate).getTime() : 0;
        return da - db; // DOL más antiguo primero (lleva más tiempo esperando)
      }
      if (sortBy === 'created') {
        // Caso más antiguo primero (espera más tiempo en la queue)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return 0;
    });

  const handleNewCase = () => {
    setNewCaseInitial(null);
    setNewCaseOpen(true);
  };

  // ─── Handler · al contestar una llamada entrante simulada ──────────────
  // Phase 1A: viene del IncomingCallSimulator
  // Phase 2:  vendrá del WebSocket de Weave (mismo shape)
  const handleAnswerIncoming = (call: IncomingCallData) => {
    setNewCaseInitial({
      mode: 'incoming',
      firstName: call.patient?.firstName ?? '',
      lastName: call.patient?.lastName ?? '',
      phone: call.phone,
      email: call.patient?.email ?? '',
      existingPatientId: call.patient?.id ?? null,
    });
    setNewCaseOpen(true);
  };
  const handleSendPortal = (c: PhoenixCase) => setSendPortalCase(c);
  const handleConfirm    = (c: PhoenixCase) => setConfirmCase(c);
  const handleSchedule   = (c: PhoenixCase) => setScheduleCase(c);

  // Phase 1A dev helper — simula que paciente completó el portal (sin portal real)
  const handleSimulateIntake = async (c: PhoenixCase) => {
    setMarkingIntake(c.id);
    try {
      const res = await fetch(`/api/admin/cases/${c.id}/mark-intake-complete`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setMarkingIntake(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {t('workspace')}
            </span>
            <span>· {t('subtitle')}</span>
          </span>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <IncomingCallSimulator samplePatients={samplePatients} onAnswer={handleAnswerIncoming} />
            <Button onClick={handleNewCase} className="shadow-glow">
              <PhoneCall className="w-4 h-4 mr-2" />
              {t('newButton')}
            </Button>
          </div>
        }
      />

      {/* Toast de llamada entrante (DEV · simula Weave Phase 2) */}
      <IncomingCallToast onAnswer={handleAnswerIncoming} />

      {/* Phone-style call indicator — específico de Front Office */}
      <div className="rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-2.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-emerald/15 flex items-center justify-center shrink-0">
          <Phone className="w-3.5 h-3.5 text-emerald" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-emerald text-[10px] font-semibold uppercase tracking-wider">{t('lineAvailable')}</div>
          <div className="text-text-muted text-[11px] truncate">{t('lineSubtitle')}</div>
        </div>
        <span className="text-text-muted text-[10px] font-mono shrink-0">{t('callReady')}</span>
      </div>

      {/* KPIs — compact 4-col grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('kpiNewReferrals')}     value={stats.NEW_REFERRAL}     sub={t('kpiNewReferralsSub')}    color="text-rose"    compact />
        <KpiCard label={t('kpiIntakePending')}    value={stats.INTAKE_PENDING}   sub={t('kpiIntakePendingSub')}   color="text-amber"   compact />
        <KpiCard label={t('kpiIntakeCompleted')}  value={stats.INTAKE_COMPLETED} sub={t('kpiIntakeCompletedSub')} color="text-cyan"    compact />
        <KpiCard label={t('kpiConfirmed')}        value={stats.CONFIRMED}        sub={t('kpiConfirmedSub')}       color="text-emerald" compact />
      </div>

      {/* Acciones rápidas */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleNewCase}>
          <Plus className="w-3 h-3 mr-1" /> Nueva llamada
        </Button>
        <Button size="sm" variant="outline" onClick={handleNewCase}>
          <Send className="w-3 h-3 mr-1" /> Procesar referido
        </Button>
        <Button size="sm" variant="outline" onClick={() => setScheduleCase(cases.find(c => c.status === 'CONFIRMED') ?? null)}>
          <Calendar className="w-3 h-3 mr-1" /> Agendar cita
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSendPortalCase(cases.find(c => c.status === 'NEW_REFERRAL') ?? null)}>
          <Mail className="w-3 h-3 mr-1" /> Reenviar formulario
        </Button>
      </div>

      {/* Filters + Search + Sort — en una sola línea compacta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold shrink-0">{t('queueTitle')}:</span>
        <FilterPill active={filter === 'all'}              onClick={() => setFilter('all')}              label={t('filterAll')}       count={cases.length} />
        <FilterPill active={filter === 'NEW_REFERRAL'}     onClick={() => setFilter('NEW_REFERRAL')}     label={t('filterNew')}        count={stats.NEW_REFERRAL} />
        <FilterPill active={filter === 'INTAKE_PENDING'}   onClick={() => setFilter('INTAKE_PENDING')}   label={t('filterPending')}    count={stats.INTAKE_PENDING} />
        <FilterPill active={filter === 'INTAKE_COMPLETED'} onClick={() => setFilter('INTAKE_COMPLETED')} label={t('filterToConfirm')}  count={stats.INTAKE_COMPLETED} />
        <FilterPill active={filter === 'CONFIRMED'}        onClick={() => setFilter('CONFIRMED')}        label={t('filterConfirmed')}  count={stats.CONFIRMED} />

        {/* Search inline */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-6 py-1.5 text-xs bg-bg-2 border border-border rounded-lg text-text-1 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand/40 focus:border-brand/40 transition-colors w-36 focus:w-52 transition-[width]"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 shrink-0">
          <ArrowUpDown className="w-3 h-3 text-text-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="py-1.5 pl-1.5 pr-5 text-xs bg-bg-2 border border-border rounded-lg text-text-1 focus:outline-none focus:ring-1 focus:ring-brand/40 appearance-none cursor-pointer"
          >
            <option value="urgency">Urgencia</option>
            <option value="dol">DOL</option>
            <option value="created">En cola</option>
          </select>
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-brand" />
          Casos en cola
          {(search || filter !== 'all') && (
            <span className="text-text-muted font-normal ml-1">— {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Case list — filas compactas */}
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/60">
        {filtered.length === 0 && !search && filter === 'all' ? (
          <div className="p-6">
            <EmptyState.Rich
              icon={FileText}
              title="No hay casos en esta cola"
              subtitle='Buen trabajo. Cuando entre una llamada, click "Nueva llamada".'
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState.Rich
              icon={Search}
              title={search ? `Sin resultados para "${search}"` : 'No hay casos con este filtro'}
              subtitle={
                search
                  ? 'Probá con el nombre completo, número de teléfono o código del caso'
                  : 'Cambiá el filtro de status para ver otros casos'
              }
            />
          </div>
        ) : (
          filtered.map((c) => (
            <CaseCard
              key={c.id}
              case={c}
              onClick={() => router.push(`/front-office/${c.id}`)}
              onSendPortal={() => handleSendPortal(c)}
              onConfirm={() => handleConfirm(c)}
              onSchedule={() => handleSchedule(c)}
              onSimulateIntake={() => handleSimulateIntake(c)}
              isMarkingIntake={markingIntake === c.id}
            />
          ))
        )}
      </div>

      {/* Footer help */}
      <div className="text-xs text-text-muted text-center pt-2 border-t border-border/40">
        {t('footerMockData')}
      </div>

      {/* B.2 — New Case modal · llamada completa (10-15 min) */}
      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={(open) => {
          setNewCaseOpen(open);
          if (!open) setNewCaseInitial(null);
        }}
        specialties={specialties}
        clinics={clinics}
        providers={providers}
        initialState={newCaseInitial}
      />

      {/* B.3 — Send Portal modal */}
      <SendPortalDialog
        open={sendPortalCase !== null}
        onOpenChange={(open) => { if (!open) setSendPortalCase(null); }}
        caseInfo={sendPortalCase ? {
          id: sendPortalCase.id,
          caseCode: sendPortalCase.caseCode,
          patient: {
            firstName: sendPortalCase.patient.firstName,
            lastName: sendPortalCase.patient.lastName,
            phone: sendPortalCase.patient.phone,
            email: sendPortalCase.patient.email,
          },
        } : null}
      />

      {/* B.4 — Confirm appointment modal */}
      <ConfirmAppointmentDialog
        open={confirmCase !== null}
        onOpenChange={(open) => { if (!open) setConfirmCase(null); }}
        caseInfo={confirmCase ? {
          id: confirmCase.id,
          caseCode: confirmCase.caseCode,
          patient: {
            firstName: confirmCase.patient.firstName,
            lastName: confirmCase.patient.lastName,
            phone: confirmCase.patient.phone,
          },
          accidentDate: confirmCase.accidentDate,
          accidentLocation: confirmCase.accidentLocation,
          primaryInsurance: confirmCase.primaryInsurance,
          lawFirm: confirmCase.lawFirm,
        } : null}
      />

      {/* B.10 — Schedule first appointment modal */}
      <ScheduleAppointmentDialog
        open={scheduleCase !== null}
        onOpenChange={(open) => { if (!open) setScheduleCase(null); }}
        caseInfo={scheduleCase ? {
          id: scheduleCase.id,
          caseCode: scheduleCase.caseCode,
          patient: {
            firstName: scheduleCase.patient.firstName,
            lastName: scheduleCase.patient.lastName,
          },
          specialty: scheduleCase.specialty,
        } : null}
      />
    </div>
  );
}

// ─── CaseCard — fila compacta estilo mockup ──────────────────────────────────
// Altura ~60px: avatar + nombre + fuente · status badge · botón de acción · chevron

function CaseCard({
  case: c,
  onClick,
  onSendPortal,
  onConfirm,
  onSchedule,
  onSimulateIntake,
  isMarkingIntake,
}: {
  case: PhoenixCase;
  onClick: () => void;
  onSendPortal: () => void;
  onConfirm: () => void;
  onSchedule: () => void;
  onSimulateIntake: () => void;
  isMarkingIntake: boolean;
}) {
  const statusMeta: Record<CaseStatus, { label: string; colorClass: string }> = {
    NEW_REFERRAL:     { label: 'Nuevo',             colorClass: 'bg-rose/10 text-rose border-rose/30' },
    INTAKE_PENDING:   { label: 'Intake pendiente',  colorClass: 'bg-amber/10 text-amber border-amber/30' },
    INTAKE_COMPLETED: { label: 'Por confirmar',     colorClass: 'bg-cyan/10 text-cyan border-cyan/30' },
    CONFIRMED:        { label: 'Confirmado',        colorClass: 'bg-emerald/10 text-emerald border-emerald/30' },
    ACTIVE:           { label: 'Activo',            colorClass: 'bg-brand/10 text-brand border-brand/30' },
    MMI:              { label: 'MMI',               colorClass: 'bg-violet/10 text-violet border-violet/30' },
    CLOSED:           { label: 'Cerrado',           colorClass: 'bg-text-muted/10 text-text-muted border-border' },
    SETTLED:          { label: 'Settlement',        colorClass: 'bg-emerald/10 text-emerald border-emerald/30' },
    ARCHIVED:         { label: 'Archivado',         colorClass: 'bg-text-muted/10 text-text-muted border-border' },
    CANCELLED:        { label: 'Cancelado',         colorClass: 'bg-rose/10 text-rose border-rose/30' },
  };
  const st = statusMeta[c.status];

  const age = ageInHours(c.createdAt);
  const ageLabel = age < 1 ? 'ahora' : age < 24 ? `${Math.floor(age)}h` : `${Math.floor(age / 24)}d`;

  // Fuente del referido (source → label corto + bufete si hay)
  const sourceMap: Record<string, string> = {
    PHONE_CALL: 'Llamada', FAX: 'Fax', EMAIL: 'Email',
    WALK_IN: 'Walk-in', REFERRAL: 'Referido', WEBSITE: 'Web',
  };
  const sourceText = sourceMap[c.source] ?? c.source;
  const subLine = [
    sourceText,
    c.lawFirm?.firmName,
    c.primaryInsurance?.shortCode,
    c.accidentDate ? `DOL ${formatDate(c.accidentDate)}` : null,
  ].filter(Boolean).join(' · ');

  // Botón de acción contextual
  const actionBtn = (() => {
    if (c.status === 'NEW_REFERRAL')
      return (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSendPortal(); }}>
          <Send className="w-3 h-3 mr-1" /> Enviar Forms
        </Button>
      );
    if (c.status === 'INTAKE_PENDING')
      return (
        <Button
          size="sm" variant="outline"
          className="text-[10px] opacity-60 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onSimulateIntake(); }}
          disabled={isMarkingIntake}
          title="Phase 1A dev: simula que el paciente completó el portal"
        >
          <Zap className="w-3 h-3 mr-1" />{isMarkingIntake ? '...' : 'DEV ⚡'}
        </Button>
      );
    if (c.status === 'INTAKE_COMPLETED')
      return (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>
          <FileCheck className="w-3 h-3 mr-1" /> Confirmar
        </Button>
      );
    if (c.status === 'CONFIRMED')
      return (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
          <CalendarCheck className="w-3 h-3 mr-1" /> Agendar
        </Button>
      );
    return null;
  })();

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 bg-bg-1 px-4 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
    >
      {/* Avatar pequeño */}
      <PersonAvatar firstName={c.patient.firstName} lastName={c.patient.lastName} size={9} gradientClass="bg-gradient-brand" />

      {/* Nombre + sub-line */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-text-1 font-semibold text-sm truncate">
            {c.patient.firstName} {c.patient.lastName}
          </span>
          <code className="text-text-muted text-[10px] font-mono shrink-0 hidden sm:inline">{c.caseCode}</code>
        </div>
        {subLine && (
          <div className="text-text-muted text-xs mt-0.5 truncate">{subLine}</div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-text-muted text-[10px] hidden md:inline">{ageLabel}</span>
        <TagPill label={st.label} colorClass={st.colorClass} compact />
        {actionBtn}
        <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-text-1 transition-colors" />
      </div>
    </div>
  );
}

function ageInHours(date: Date): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(d: Date): string {
  const h = ageInHours(d);
  if (h < 1) return 'hace minutos';
  if (h < 24) return `hace ${Math.floor(h)}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
