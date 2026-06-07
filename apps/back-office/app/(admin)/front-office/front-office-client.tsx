'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Phone, PhoneCall, FileText, Mail, Send, ChevronRight, AlertCircle, Plus, Calendar, MapPin, Building2, FileCheck, Zap, CalendarCheck } from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  FilterPill,
  TagPill,
  EmptyState,
  PersonAvatar,
} from '@/components/ui-phoenix';
import { NewCaseDialog } from '@/components/cases/new-case-dialog';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { ConfirmAppointmentDialog } from '@/components/cases/confirm-appointment-dialog';
import { ScheduleAppointmentDialog } from '@/components/cases/schedule-appointment-dialog';

// B.1 — Front Office · Recepción primaria

type CaseStatus = 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED';

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
}

export function FrontOfficeClient({ cases, stats, specialties, clinics, providers }: Props) {
  const router = useRouter();
  const t = useTranslations('phoenix.frontOffice');
  const [filter, setFilter] = useState<'all' | CaseStatus>('all');
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [sendPortalCase, setSendPortalCase] = useState<PhoenixCase | null>(null);
  const [confirmCase, setConfirmCase] = useState<PhoenixCase | null>(null);
  const [scheduleCase, setScheduleCase] = useState<PhoenixCase | null>(null);
  const [markingIntake, setMarkingIntake] = useState<string | null>(null);

  const filtered = filter === 'all' ? cases : cases.filter((c) => c.status === filter);

  const handleNewCase = () => setNewCaseOpen(true);
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
    <div className="space-y-6">
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
          <Button onClick={handleNewCase} className="shadow-glow">
            <PhoneCall className="w-4 h-4 mr-2" />
            {t('newButton')}
          </Button>
        }
      />

      {/* Phone-style call indicator — específico de Front Office */}
      <div className="rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald/15 flex items-center justify-center">
          <Phone className="w-4 h-4 text-emerald" />
        </div>
        <div className="flex-1">
          <div className="text-emerald text-xs font-semibold uppercase tracking-wider">{t('lineAvailable')}</div>
          <div className="text-text-2 text-xs">{t('lineSubtitle')}</div>
        </div>
        <span className="text-text-muted text-[10px] font-mono">{t('callReady')}</span>
      </div>

      {/* KPIs por status — usan KpiCard shared */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiNewReferrals')}     value={stats.NEW_REFERRAL}    sub={t('kpiNewReferralsSub')}    color="text-rose" />
        <KpiCard label={t('kpiIntakePending')}    value={stats.INTAKE_PENDING}  sub={t('kpiIntakePendingSub')}   color="text-amber" />
        <KpiCard label={t('kpiIntakeCompleted')}  value={stats.INTAKE_COMPLETED} sub={t('kpiIntakeCompletedSub')} color="text-cyan" />
        <KpiCard label={t('kpiConfirmed')}        value={stats.CONFIRMED}       sub={t('kpiConfirmedSub')}       color="text-emerald" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mr-2">{t('queueTitle')}:</span>
        <FilterPill active={filter === 'all'}              onClick={() => setFilter('all')}              label={t('filterAll')}        count={cases.length} />
        <FilterPill active={filter === 'NEW_REFERRAL'}     onClick={() => setFilter('NEW_REFERRAL')}     label={t('filterNew')}         count={stats.NEW_REFERRAL} />
        <FilterPill active={filter === 'INTAKE_PENDING'}   onClick={() => setFilter('INTAKE_PENDING')}   label={t('filterPending')}     count={stats.INTAKE_PENDING} />
        <FilterPill active={filter === 'INTAKE_COMPLETED'} onClick={() => setFilter('INTAKE_COMPLETED')} label={t('filterToConfirm')}   count={stats.INTAKE_COMPLETED} />
        <FilterPill active={filter === 'CONFIRMED'}        onClick={() => setFilter('CONFIRMED')}        label={t('filterConfirmed')}   count={stats.CONFIRMED} />
      </div>

      {/* Case list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState.Rich
            icon={FileText}
            title="No hay casos en esta cola"
            subtitle='Buen trabajo. Cuando entre una llamada, click "Nueva llamada".'
          />
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
      <div className="text-xs text-text-muted text-center pt-4 border-t border-border/40">
        {t('footerMockData')}
      </div>

      {/* B.2 — New Case modal · llamada completa (10-15 min) */}
      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        specialties={specialties}
        clinics={clinics}
        providers={providers}
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

// ─── CaseCard (queue inbox · forma única de Front Office) ────────────────────

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
  const statusMeta: Record<CaseStatus, { label: string; colorClass: string; icon: string }> = {
    NEW_REFERRAL:     { label: 'Nuevo referido',      colorClass: 'bg-rose/10 text-rose border-rose/30',         icon: '🔴' },
    INTAKE_PENDING:   { label: 'Intake pendiente',    colorClass: 'bg-amber/10 text-amber border-amber/30',     icon: '🟡' },
    INTAKE_COMPLETED: { label: 'Por confirmar (24h)', colorClass: 'bg-cyan/10 text-cyan border-cyan/30',         icon: '🔵' },
    CONFIRMED:        { label: 'Confirmado',          colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: '🟢' },
  };
  const st = statusMeta[c.status];

  const age = ageInHours(c.createdAt);
  const ageLabel = age < 1 ? 'hace minutos' : age < 24 ? `hace ${Math.floor(age)}h` : `hace ${Math.floor(age / 24)}d`;

  return (
    <div
      onClick={onClick}
      className="group rounded-lg border border-border bg-bg-1 p-5 hover:border-border-strong hover:bg-bg-1/80 cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <PersonAvatar firstName={c.patient.firstName} lastName={c.patient.lastName} size={12} gradientClass="bg-gradient-cyan" />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div className="text-text-1 font-bold text-base">
                {c.patient.firstName} {c.patient.lastName}
              </div>
              <code className="text-text-muted text-xs font-mono">{c.caseCode}</code>
              <TagPill label={<span><span className="mr-1">{st.icon}</span>{st.label}</span>} colorClass={st.colorClass} />
            </div>

            {/* Sub-info */}
            <div className="flex items-center gap-x-4 gap-y-1 text-xs text-text-2 flex-wrap mt-1">
              {c.patient.phone && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-text-muted" /> {c.patient.phone}
                </span>
              )}
              {c.accidentDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-text-muted" /> DOL: {formatDate(c.accidentDate)}
                </span>
              )}
              {c.accidentLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-text-muted" /> {c.accidentLocation}
                </span>
              )}
            </div>

            {/* Pills row · domain tags (specialty + lawFirm + insurance) */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {c.specialty && (
                <TagPill
                  label={c.specialty.name}
                  colorClass="bg-bg-2 text-text-2 border-border"
                  compact
                  icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: c.specialty.color }} />}
                />
              )}
              {c.lawFirm && (
                <TagPill
                  label={
                    <>
                      ⚖️ {c.lawFirm.firmName}
                      {c.lawFirm.paymentSpeed === 'SLOW' && <span className="text-amber ml-1" title="Pago lento">⚠</span>}
                    </>
                  }
                  colorClass="bg-bg-2 text-text-2 border-border"
                  compact
                />
              )}
              {c.primaryInsurance && (
                <TagPill
                  label={
                    <>
                      {c.primaryInsurance.name}
                      {c.primaryInsurance.responseSpeed === 'SLOW' && <span className="text-amber ml-1">⚠</span>}
                    </>
                  }
                  colorClass="bg-bg-2 text-text-2 border-border"
                  compact
                  icon={
                    <span className="w-3 h-3 rounded flex items-center justify-center text-white text-[7px] font-bold" style={{ background: c.primaryInsurance.color }}>
                      {c.primaryInsurance.shortCode}
                    </span>
                  }
                />
              )}
              <span className="text-text-muted text-[10px] ml-auto">{ageLabel}</span>
            </div>

            {/* Action prompt by status */}
            {c.status === 'NEW_REFERRAL' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-rose">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="font-semibold">Acción: contactar paciente + enviar portal SMS</span>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSendPortal(); }}>
                  <Send className="w-3 h-3 mr-1" /> Enviar portal
                </Button>
              </div>
            )}
            {c.status === 'INTAKE_PENDING' && c.intakeFormSentAt && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber flex-wrap">
                <Mail className="w-3.5 h-3.5" />
                <span>Portal {c.intakeFormSentVia} enviado {formatRelative(c.intakeFormSentAt)} · Esperando paciente complete</span>
                {/* Phase 1A dev helper — simula que el paciente completó el portal */}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-[10px] opacity-70 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onSimulateIntake(); }}
                  disabled={isMarkingIntake}
                  title="Phase 1A dev · Simula que el paciente completó el portal (B.5-B.9 stub)"
                >
                  <Zap className="w-3 h-3 mr-1" />
                  {isMarkingIntake ? 'Simulando...' : 'DEV · Simular portal completo'}
                </Button>
              </div>
            )}
            {c.status === 'INTAKE_COMPLETED' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-cyan">
                <Phone className="w-3.5 h-3.5" />
                <span className="font-semibold">Acción: llamar 24h antes para confirmar cita</span>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>
                  <FileCheck className="w-3 h-3 mr-1" />
                  Confirmar
                </Button>
              </div>
            )}
            {c.status === 'CONFIRMED' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald flex-wrap">
                <CalendarCheck className="w-3.5 h-3.5" />
                <span className="font-semibold">Acción: agendar primera cita (doctor + slot)</span>
                {c.firstAppointmentConfirmedAt && (
                  <span className="text-text-muted">· confirmado {formatRelative(c.firstAppointmentConfirmedAt)}</span>
                )}
                <Button size="sm" variant="outline" className="ml-auto" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                  <CalendarCheck className="w-3 h-3 mr-1" />
                  Agendar
                </Button>
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-text-1 transition-colors shrink-0 self-center" />
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
