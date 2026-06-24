'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Scale, Shield, AlertCircle,
  Send, FileCheck, MessageSquarePlus, Clock, User, Bot, Cpu, FileText,
  PhoneCall, Zap, AlertTriangle, CalendarCheck, Pencil,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { PageHeader, TagPill, PersonAvatar, EntityAvatar } from '@/components/ui-phoenix';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { ConfirmAppointmentDialog } from '@/components/cases/confirm-appointment-dialog';
import { AddNoteDialog } from '@/components/cases/add-note-dialog';
import { ScheduleAppointmentDialog } from '@/components/cases/schedule-appointment-dialog';

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
    patientCode: string | null;
  };
  lawFirm: {
    id: string;
    firmName: string | null;
    email: string;
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
    email: string;
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
}

export function CaseDetailClient({ caseInfo, auditEvents }: Props) {
  const t = useTranslations('phoenix.caseDetail');
  const router = useRouter();
  const [sendPortalOpen, setSendPortalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [markingIntake, setMarkingIntake] = useState(false);

  const STATUS_META: Record<CaseStatus, { label: string; colorClass: string; icon: string }> = {
    NEW_REFERRAL:     { label: t('statusNewReferral'),      colorClass: 'bg-rose/10 text-rose border-rose/30',         icon: '🔴' },
    INTAKE_PENDING:   { label: t('statusIntakePending'),    colorClass: 'bg-amber/10 text-amber border-amber/30',     icon: '🟡' },
    INTAKE_COMPLETED: { label: t('statusIntakeCompleted'),  colorClass: 'bg-cyan/10 text-cyan border-cyan/30',         icon: '🔵' },
    CONFIRMED:        { label: t('statusConfirmed'),        colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: '🟢' },
    ACTIVE:           { label: t('statusActive'),           colorClass: 'bg-brand/10 text-brand border-brand/30',     icon: '⚕️' },
    MMI:              { label: t('statusMmi'),              colorClass: 'bg-violet/10 text-violet border-violet/30',  icon: '🏁' },
    CLOSED:           { label: t('statusClosed'),           colorClass: 'bg-bg-2 text-text-2 border-border',           icon: '✓' },
    SETTLED:          { label: t('statusSettled'),          colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: '💰' },
    ARCHIVED:         { label: t('statusArchived'),         colorClass: 'bg-bg-2 text-text-muted border-border',       icon: '📦' },
    CANCELLED:        { label: t('statusCancelled'),        colorClass: 'bg-rose/10 text-rose border-rose/30',         icon: '✗' },
  };

  const st = STATUS_META[caseInfo.status];
  const age = (caseInfo.patient.dateOfBirth)
    ? Math.floor((Date.now() - new Date(caseInfo.patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

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
        <Link
          href="/front-office"
          className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToQueue')}
        </Link>
        <TagPill label={<span><span className="mr-1">{st.icon}</span>{st.label}</span>} colorClass={st.colorClass} />
      </div>

      {/* Hero · paciente */}
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            <PersonAvatar firstName={caseInfo.patient.firstName} lastName={caseInfo.patient.lastName} size={12} gradientClass="bg-gradient-cyan" />
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
            <Link
              href={`/patients/${caseInfo.patient.id}`}
              className="inline-flex items-center gap-1 text-text-muted hover:text-brand text-xs transition-colors"
            >
              <Pencil className="w-3 h-3" /> Editar paciente
            </Link>
          </span>
        }
        action={<ActionButtons status={caseInfo.status} onSendPortal={() => setSendPortalOpen(true)} onConfirm={() => setConfirmOpen(true)} onSchedule={() => setScheduleOpen(true)} onAddNote={() => setAddNoteOpen(true)} onSimulateIntake={handleSimulateIntake} isMarkingIntake={markingIntake} />}
      />

      {/* Next action banner según status */}
      <NextActionBanner caseInfo={caseInfo} />

      {/* Grid: izquierda info bloques, derecha timeline+notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna izquierda · datos del caso */}
        <div className="space-y-4 lg:col-span-2">
          <InfoCard title={t('sectionAccident')} icon={Calendar}>
            <InfoRow label={t('fieldDol')} value={caseInfo.accidentDate ? formatDate(caseInfo.accidentDate) : '—'} />
            <InfoRow label={t('fieldType')} value={caseInfo.accidentType ?? '—'} />
            <InfoRow label={t('fieldLocation')} value={caseInfo.accidentLocation ?? '—'} />
            {caseInfo.accidentNotes && (
              <InfoRow label={t('fieldNotes')} value={<div className="text-text-2 text-xs whitespace-pre-wrap">{caseInfo.accidentNotes}</div>} />
            )}
            <InfoRow label={t('fieldSpecialty')} value={
              caseInfo.specialty ? (
                <TagPill
                  label={caseInfo.specialty.name}
                  colorClass="bg-bg-2 text-text-2 border-border"
                  compact
                  icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: caseInfo.specialty.color }} />}
                />
              ) : '—'
            } />
            <InfoRow label={t('fieldWorkflow')} value={<code className="text-text-2 font-mono text-xs">{caseInfo.caseType}</code>} />
          </InfoCard>

          <InfoCard title={t('sectionLegal')} icon={Scale}>
            {caseInfo.lawFirm ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <EntityAvatar name={caseInfo.lawFirm.firmName ?? '?'} />
                  <div className="min-w-0">
                    <Link href={`/admin/lawyers/${caseInfo.lawFirm.id}`} className="text-text-1 font-semibold hover:text-brand truncate block">
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
                <InfoRow label={t('fieldFirmEmail')} value={
                  <a href={`mailto:${caseInfo.lawFirm.email}`} className="text-cyan hover:text-text-1">{caseInfo.lawFirm.email}</a>
                } />
                {caseInfo.lawFirm.phone && <InfoRow label={t('fieldPhone')} value={<span className="font-mono">{caseInfo.lawFirm.phone}</span>} />}
                {caseInfo.lawFirm.caseflowFlags.length > 0 && (
                  <InfoRow label={t('fieldFlags')} value={
                    <div className="flex flex-wrap gap-1">
                      {caseInfo.lawFirm.caseflowFlags.map((f) => (
                        <TagPill key={f} label={f} colorClass="bg-brand/10 text-brand border-brand/20" mono compact />
                      ))}
                    </div>
                  } />
                )}
                {caseInfo.attorney && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-2">{t('assignedAttorney')}</div>
                    <div className="flex items-center gap-2">
                      <PersonAvatar firstName={caseInfo.attorney.firstName ?? '?'} lastName={caseInfo.attorney.lastName ?? ''} size={8} />
                      <div className="min-w-0 flex-1">
                        <div className="text-text-1 text-sm">{caseInfo.attorney.firstName} {caseInfo.attorney.lastName}</div>
                        <div className="text-text-muted text-[11px]">{caseInfo.attorney.email}</div>
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
          </InfoCard>

          <InfoCard title={t('sectionInsurance')} icon={Shield}>
            {caseInfo.primaryInsurance ? (
              <div className="space-y-3">
                <div className="rounded-md border border-cyan/30 bg-cyan/5 p-3">
                  <div className="flex items-center gap-3">
                    <EntityAvatar code={caseInfo.primaryInsurance.shortCode} color={caseInfo.primaryInsurance.color} />
                    <div className="min-w-0 flex-1">
                      <div className="text-text-1 font-semibold truncate flex items-center gap-1">
                        {caseInfo.primaryInsurance.name}
                        {caseInfo.primaryInsurance.responseSpeed === 'SLOW' && (
                          <AlertTriangle className="w-3 h-3 text-amber" />
                        )}
                      </div>
                      <div className="text-text-muted text-[11px]">Primary · {caseInfo.primaryInsurance.type}</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {caseInfo.primaryPolicyNumber && (
                      <div><span className="text-text-muted">Policy:</span> <code className="text-text-1 font-mono">{caseInfo.primaryPolicyNumber}</code></div>
                    )}
                    {caseInfo.primaryInsurance.claimsPhone && (
                      <div><span className="text-text-muted">Claims:</span> <span className="text-text-1 font-mono">{caseInfo.primaryInsurance.claimsPhone}</span></div>
                    )}
                    <div><span className="text-text-muted">HCFA:</span> <span className="text-text-1">{caseInfo.primaryInsurance.hcfaChannel}</span></div>
                    {caseInfo.primaryInsurance.preauthRequired && (
                      <div className="text-amber">⚠ {t('preauthRequired')}</div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {caseInfo.pipVerifiedAt ? (
                      <TagPill
                        label={`✓ ${t('pipVerified')} ${formatRelative(caseInfo.pipVerifiedAt)}`}
                        colorClass="bg-emerald/10 text-emerald border-emerald/30"
                      />
                    ) : (
                      <TagPill
                        label={`⏳ ${t('pipNotVerified')}`}
                        colorClass="bg-amber/10 text-amber border-amber/30"
                      />
                    )}
                  </div>
                </div>

                {caseInfo.secondaryInsurance && (
                  <div className="rounded-md border border-violet/30 bg-violet/5 p-3">
                    <div className="flex items-center gap-3">
                      <EntityAvatar code={caseInfo.secondaryInsurance.shortCode} color={caseInfo.secondaryInsurance.color} />
                      <div className="min-w-0 flex-1">
                        <div className="text-text-1 font-semibold truncate">{caseInfo.secondaryInsurance.name}</div>
                        <div className="text-text-muted text-[11px]">Secondary · {caseInfo.secondaryInsurance.type}</div>
                      </div>
                    </div>
                    {caseInfo.secondaryPolicyNumber && (
                      <div className="mt-2 text-xs"><span className="text-text-muted">Policy:</span> <code className="text-text-1 font-mono">{caseInfo.secondaryPolicyNumber}</code></div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-text-muted text-sm italic">{t('noPrimaryInsurance')}</div>
            )}
          </InfoCard>
        </div>

        {/* Columna derecha · timeline + notas */}
        <div className="space-y-4">
          <Timeline caseInfo={caseInfo} auditEvents={auditEvents} />
          <NotesPanel
            notes={caseInfo.notes}
            onAddNote={() => setAddNoteOpen(true)}
          />
        </div>
      </div>

      {/* Modals */}
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
      />

      <ScheduleAppointmentDialog
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
    </div>
  );
}

// ─── Action buttons en header ──────────────────────────────────────────────────

function ActionButtons({
  status,
  onSendPortal,
  onConfirm,
  onSchedule,
  onAddNote,
  onSimulateIntake,
  isMarkingIntake,
}: {
  status: CaseStatus;
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
        </>
      )}
      {status === 'CONFIRMED' && (
        <>
          <Button onClick={onSchedule} size="sm">
            <CalendarCheck className="w-3.5 h-3.5 mr-1" /> {t('btnScheduleFirst')}
          </Button>
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

function NextActionBanner({ caseInfo }: { caseInfo: CaseInfo }) {
  const t = useTranslations('phoenix.caseDetail');

  const cfg: Record<CaseStatus, { title: string; message: string; tone: 'rose' | 'amber' | 'cyan' | 'emerald' | 'brand' } | null> = {
    NEW_REFERRAL:     { title: t('bannerNewReferralTitle'), message: t('bannerNewReferralMsg'), tone: 'rose' },
    INTAKE_PENDING:   { title: t('bannerIntakePendingTitle'), message: t('bannerIntakePendingMsg'), tone: 'amber' },
    INTAKE_COMPLETED: { title: t('bannerIntakeCompletedTitle'), message: t('bannerIntakeCompletedMsg'), tone: 'cyan' },
    CONFIRMED:        { title: t('bannerConfirmedTitle'), message: t('bannerConfirmedMsg'), tone: 'emerald' },
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
    brand:   'bg-brand/5 border-brand/30 text-brand',
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

// ─── InfoCard + InfoRow ────────────────────────────────────────────────────────

function InfoCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-brand" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start py-1.5 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="col-span-2 text-sm text-text-1">{value}</div>
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
    LAW_FIRM_REFERRAL: t('sourceLabelLawFirm'),
    PATIENT_REFERRAL:  t('sourceLabelPatient'),
    PHONE_CALL:        t('sourceLabelPhoneCall'),
    WALK_IN:           t('sourceLabelWalkIn'),
    WEB_FORM:          t('sourceLabelWebForm'),
    AI_AGENT:          t('sourceLabelAiAgent'),
    OTHER:             t('sourceLabelOther'),
  };

  const events: Event[] = [];

  // Always: created
  events.push({
    id: 'created',
    title: t('timelineCaseCreated'),
    detail: SOURCE_LABELS[caseInfo.source] ?? caseInfo.source,
    icon: PhoneCall,
    iconColor: 'text-brand',
    at: caseInfo.createdAt,
    actor: t('timelineActorFrontOffice'),
    actorType: 'HUMAN_USER',
  });

  auditEvents.forEach((e) => {
    const cfg = AUDIT_ACTION_CFG[e.action];
    if (!cfg) return;
    events.push({
      id: e.id,
      title: cfg.title,
      detail: cfg.detail?.(e.metadata),
      icon: cfg.icon,
      iconColor: cfg.iconColor,
      at: e.createdAt,
      actor: e.actorUserId ?? (e.actorType === 'SYSTEM' ? t('timelineActorSystem') : t('timelineActorFrontOffice')),
      actorType: e.actorType as 'HUMAN_USER' | 'AI_AGENT' | 'SYSTEM',
    });
  });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="rounded-lg border border-border bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-brand" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Timeline</h3>
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
                    <span>{formatRelative(e.at)}</span>
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

const AUDIT_ACTION_CFG: Record<string, {
  title: string;
  detail?: (metadata: Record<string, unknown> | null) => string | undefined;
  icon: React.ElementType;
  iconColor: string;
}> = {
  CREATE_CASE_FROM_CALL: {
    title: 'Caso creado desde llamada',
    icon: PhoneCall,
    iconColor: 'text-brand',
  },
  SEND_PORTAL_LINK: {
    title: 'Portal enviado',
    detail: (m) => m ? `Vía ${String(m.via ?? '?')} · idioma ${String(m.language ?? '?')}` : undefined,
    icon: Send,
    iconColor: 'text-cyan',
  },
  MARK_INTAKE_COMPLETE_DEV: {
    title: 'Portal completado (simulado)',
    detail: () => 'Phase 1A dev helper — Phase 2 lo dispara el portal real',
    icon: FileText,
    iconColor: 'text-amber',
  },
  CONFIRM_FIRST_APPOINTMENT: {
    title: 'Primera cita confirmada',
    detail: (m) => {
      if (!m?.checklist) return undefined;
      const c = m.checklist as Record<string, boolean>;
      const checked = Object.values(c).filter(Boolean).length;
      return `Checklist ${checked}/4 completado`;
    },
    icon: FileCheck,
    iconColor: 'text-emerald',
  },
  SCHEDULE_FIRST_APPOINTMENT: {
    title: 'Primera cita agendada',
    detail: (m) => {
      if (!m) return undefined;
      const provider = m.providerName as string | undefined;
      const clinic = m.clinicName as string | undefined;
      const when = m.scheduledFor as string | undefined;
      const parts: string[] = [];
      if (provider) parts.push(`Dr. ${provider}`);
      if (clinic) parts.push(clinic);
      if (when) parts.push(new Date(when).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' }));
      return parts.length > 0 ? parts.join(' · ') : undefined;
    },
    icon: CalendarCheck,
    iconColor: 'text-brand',
  },
  INSERT_CASE_NOTE: {
    title: 'Nota interna agregada',
    detail: (m) => m?.contentPreview ? `"${String(m.contentPreview).slice(0, 50)}..."` : undefined,
    icon: MessageSquarePlus,
    iconColor: 'text-violet',
  },
};

// ─── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({ notes, onAddNote }: {
  notes: CaseInfo['notes'];
  onAddNote: () => void;
}) {
  const t = useTranslations('phoenix.caseDetail');
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquarePlus className="w-4 h-4 text-brand" />
        <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('sectionInternalNotes')}</h3>
        <span className="text-text-muted text-xs font-mono ml-auto">{notes.length}</span>
      </div>
      <Button onClick={onAddNote} variant="outline" size="sm" className="w-full mb-3">
        <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> {t('btnAddNote')}
      </Button>
      {notes.length === 0 ? (
        <div className="text-text-muted text-xs italic text-center py-4">{t('notesEmpty')}</div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto scroll-thin pr-1">
          {notes.map((n) => (
            <div key={n.id} className="rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] text-text-muted mb-1">
                <span className="font-semibold text-text-2">{n.authorName}</span>
                <span>·</span>
                <span>{formatRelative(n.createdAt)}</span>
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

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(d: Date | string): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) {
    const m = Math.max(1, Math.floor(h * 60));
    return `hace ${m}m`;
  }
  if (h < 24) return `hace ${Math.floor(h)}h`;
  if (h < 24 * 7) return `hace ${Math.floor(h / 24)}d`;
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric' });
}
