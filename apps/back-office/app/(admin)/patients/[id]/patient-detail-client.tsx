'use client';

/**
 * B.4 mockup · PatientDetailClient
 *
 * Ficha completa del paciente:
 *  - Header con avatar + nombre + status + edad
 *  - 3 KPIs: casos totales · casos activos · citas
 *  - InfoCards: Datos personales · Referido por
 *  - Historial de casos (todos los PhoenixCase del paciente)
 *
 * Llegás aquí desde ⌘K search, PreCallStep "Ver historial",
 * o (futuro) clic en nombre de paciente en la queue.
 */

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { PatientEditDialog } from './patient-edit-dialog';
import {
  ArrowLeft, Phone, Mail, Calendar, MapPin, Scale, FileText,
  User, Building2, ChevronRight, MessageSquare, ClipboardList,
  Cake, Hash, Clock, Stethoscope,
} from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  InfoCard,
  InfoRow,
  PersonAvatar,
  TagPill,
  EmptyState,
} from '@/components/ui-phoenix';

// ─── Tipos derivados del include de Prisma ────────────────────────────────────

type PatientStatus = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE';
type CaseStatus =
  | 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED'
  | 'ACTIVE' | 'MMI' | 'CLOSED' | 'SETTLED' | 'ARCHIVED' | 'CANCELLED';

interface PatientCase {
  id: string;
  caseCode: string;
  status: CaseStatus;
  caseType: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  createdAt: Date;
  lawFirm: { id: string; firmName: string; paymentSpeed: string | null } | null;
  attorney: { id: string; firstName: string | null; lastName: string | null } | null;
  specialty: { id: string; name: string; color: string } | null;
  primaryInsurance: { id: string; name: string; shortCode: string; color: string } | null;
  _count: { notes: number; appointments: number };
}

type AccidentType = 'AUTO' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'WORKPLACE' | 'OTHER';

interface PatientData {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: PatientStatus;
  createdAt: Date;
  preferredLanguage: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  accidentDate: Date | null;
  accidentType: AccidentType | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  lawyerReferrer: { id: string; firmName: string | null } | null;
  providerReferrer: { id: string; firstName: string; lastName: string } | null;
  cases: PatientCase[];
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const PATIENT_STATUS_COLORS: Record<PatientStatus, { colorClass: string }> = {
  NEW:        { colorClass: 'bg-brand/10 text-brand border-brand/30' },
  ACTIVE:     { colorClass: 'bg-emerald/10 text-emerald border-emerald/30' },
  COMPLETED:  { colorClass: 'bg-cyan/10 text-cyan border-cyan/30' },
  DISCHARGED: { colorClass: 'bg-violet/10 text-violet border-violet/30' },
  INACTIVE:   { colorClass: 'bg-bg-2 text-text-muted border-border' },
};

const CASE_STATUS_COLORS: Record<string, { colorClass: string; dot: string }> = {
  NEW_REFERRAL:     { colorClass: 'bg-rose/10 text-rose border-rose/30',           dot: 'bg-rose' },
  INTAKE_PENDING:   { colorClass: 'bg-amber/10 text-amber border-amber/30',        dot: 'bg-amber' },
  INTAKE_COMPLETED: { colorClass: 'bg-cyan/10 text-cyan border-cyan/30',           dot: 'bg-cyan' },
  CONFIRMED:        { colorClass: 'bg-emerald/10 text-emerald border-emerald/30',  dot: 'bg-emerald' },
  ACTIVE:           { colorClass: 'bg-brand/10 text-brand border-brand/30',        dot: 'bg-brand' },
};

// ─── Component principal ──────────────────────────────────────────────────────

export function PatientDetailClient({ patient }: { patient: PatientData }) {
  const t = useTranslations('phoenix.patients');
  const router = useRouter();

  // Estadísticas del paciente
  const totalCases = patient.cases.length;
  const activeCases = patient.cases.filter(
    (c) => !['COMPLETED', 'DISCHARGED', 'INACTIVE'].includes(c.status)
  ).length;
  const totalAppointments = patient.cases.reduce((acc, c) => acc + c._count.appointments, 0);
  const totalNotes = patient.cases.reduce((acc, c) => acc + c._count.notes, 0);

  // Edad
  const age = (() => {
    if (!patient.dateOfBirth) return null;
    const iso = typeof patient.dateOfBirth === 'string' ? patient.dateOfBirth : patient.dateOfBirth.toISOString();
    const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
    const birth = new Date(y, mo - 1, day);
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return a;
  })();

  const patientStatusColors = PATIENT_STATUS_COLORS[patient.status];
  const PATIENT_STATUS_LABEL_KEYS: Record<PatientStatus, string> = {
    NEW:        t('patientStatus.NEW'),
    ACTIVE:     t('patientStatus.ACTIVE'),
    COMPLETED:  t('patientStatus.COMPLETED'),
    DISCHARGED: t('patientStatus.DISCHARGED'),
    INACTIVE:   t('patientStatus.INACTIVE'),
  };
  const patientStatusLabel = PATIENT_STATUS_LABEL_KEYS[patient.status];

  return (
    <div className="space-y-6">

      {/* PageHeader */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <PersonAvatar
              firstName={patient.firstName}
              lastName={patient.lastName}
              size={10}
              gradientClass="bg-gradient-brand"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>{patient.firstName} {patient.lastName}</span>
                <TagPill
                  label={patientStatusLabel}
                  colorClass={patientStatusColors.colorClass}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <code className="text-text-muted text-xs font-mono font-normal">{patient.patientCode}</code>
                {age !== null && (
                  <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                    <Cake className="w-3 h-3" /> {t('ageYears', { age })}
                  </span>
                )}
                <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t('registeredRelative', { relative: formatRelative(patient.createdAt, t) })}
                </span>
              </div>
            </div>
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              {t('actionBack')}
            </Button>
            {patient.phone && (
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => window.open(`tel:${patient.phone}`)}
              >
                <Phone className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">{t('actionCall')}</span>
              </Button>
            )}
            <PatientEditDialog patient={patient} />
          </div>
        }
      />

      {/* KPIs strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotalCases')}       value={totalCases}        sub={t('kpiTotalCasesSub')}        color="text-brand" />
        <KpiCard label={t('kpiActiveCases')}      value={activeCases}       sub={t('kpiActiveCasesSub')}       color="text-emerald" />
        <KpiCard label={t('kpiTotalAppointments')} value={totalAppointments} sub={t('kpiTotalAppointmentsSub')} color="text-cyan" />
        <KpiCard label={t('kpiInternalNotes')}    value={totalNotes}        sub={t('kpiInternalNotesSub')}     color="text-violet" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Datos personales */}
        <InfoCard title={t('sectionPersonalData')} icon={User}>
          <InfoRow
            label={t('fieldCode')}
            value={<code className="font-mono text-brand text-[11px]">{patient.patientCode}</code>}
          />
          <InfoRow
            label={t('fieldDob')}
            value={
              patient.dateOfBirth
                ? <span>{formatDate(patient.dateOfBirth)}{age !== null ? <span className="text-text-muted ml-2">({t('ageYears', { age })})</span> : null}</span>
                : <span className="text-text-muted italic">{t('dobNotRegistered')}</span>
            }
          />
          <InfoRow
            label={t('fieldPhone')}
            value={
              patient.phone
                ? <a href={`tel:${patient.phone}`} className="text-brand hover:underline font-mono text-[12.5px]">{patient.phone}</a>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldEmail')}
            value={
              patient.email
                ? <a href={`mailto:${patient.email}`} className="text-brand hover:underline text-[12.5px] break-all">{patient.email}</a>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldStatus')}
            value={<TagPill label={patientStatusLabel} colorClass={patientStatusColors.colorClass} />}
          />
        </InfoCard>

        {/* Referido por */}
        <InfoCard title={t('sectionReferredBy')} icon={Scale}>
          <InfoRow
            label={t('fieldFirm')}
            value={
              patient.lawyerReferrer
                ? <span className="flex items-center gap-1.5"><Scale className="w-3 h-3 text-text-muted" />{patient.lawyerReferrer.firmName}</span>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldProvider')}
            value={
              patient.providerReferrer
                ? `${patient.providerReferrer.firstName} ${patient.providerReferrer.lastName}`
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldRegistered')}
            value={<span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-text-muted" />{formatDate(patient.createdAt)}</span>}
          />
          <InfoRow
            label={t('fieldTotalCases')}
            value={
              <span className="flex items-center gap-1 text-brand font-semibold">
                <Hash className="w-3 h-3" />{t('caseCount', { count: totalCases })}
              </span>
            }
          />
        </InfoCard>
      </div>

      {/* Historial de casos */}
      <InfoCard
        title={t('sectionCaseHistory')}
        icon={ClipboardList}
        rightSlot={
          <TagPill
            label={t('caseCount', { count: totalCases })}
            colorClass="bg-brand/10 text-brand border-brand/30"
            compact
          />
        }
      >
        {patient.cases.length === 0 ? (
          <EmptyState.Inline message={t('emptyCases')} />
        ) : (
          <div className="space-y-2 -mx-1">
            {patient.cases.map((c) => (
              <CaseRow
                key={c.id}
                case={c}
                onClick={() => router.push(`/front-office/${c.id}`)}
              />
            ))}
          </div>
        )}
      </InfoCard>

      {/* Footer note */}
      <div className="text-xs text-text-muted text-center pt-2 border-t border-border/40">
        Phase 1A · mock data · sin PHI real · 2026-06-07
      </div>
    </div>
  );
}

// ─── CaseRow — fila de caso dentro de la ficha del paciente ─────────────────

function CaseRow({ case: c, onClick }: { case: PatientCase; onClick: () => void }) {
  const t = useTranslations('phoenix.patients');
  const stColors = CASE_STATUS_COLORS[c.status] ?? CASE_STATUS_COLORS.NEW_REFERRAL;
  const CASE_STATUS_LABEL_KEYS: Record<string, string> = {
    NEW_REFERRAL:     t('caseStatus.NEW_REFERRAL'),
    INTAKE_PENDING:   t('caseStatus.INTAKE_PENDING'),
    INTAKE_COMPLETED: t('caseStatus.INTAKE_COMPLETED'),
    CONFIRMED:        t('caseStatus.CONFIRMED'),
    ACTIVE:           t('caseStatus.ACTIVE'),
  };
  const stLabel = CASE_STATUS_LABEL_KEYS[c.status] ?? t('caseStatus.NEW_REFERRAL');
  const ageH = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
  const ageLabel = ageH < 1 ? t('ageMinutes') : ageH < 24 ? t('ageHours', { h: Math.floor(ageH) }) : t('ageDays', { d: Math.floor(ageH / 24) });

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-lg border border-border bg-bg-2/40 hover:bg-bg-2 hover:border-border-strong px-4 py-3 transition-all"
    >
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">

        {/* Status dot + code */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${stColors.dot}`} />
          <code className="text-text-2 text-xs font-mono">{c.caseCode}</code>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TagPill label={stLabel} colorClass={stColors.colorClass} compact />
            {c.specialty && (
              <TagPill
                label={c.specialty.name}
                colorClass="bg-bg-3 text-text-2 border-border"
                compact
                icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: c.specialty.color }} />}
              />
            )}
            {c.caseType && c.caseType !== 'MVA' && (
              <TagPill label={c.caseType} colorClass="bg-bg-3 text-text-2 border-border" compact />
            )}
          </div>

          <div className="flex items-center gap-x-4 gap-y-0.5 text-[11px] text-text-muted flex-wrap">
            {c.accidentDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />DOL: {formatDate(c.accidentDate)}
              </span>
            )}
            {c.accidentLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />{c.accidentLocation}
              </span>
            )}
            {c.lawFirm && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />{c.lawFirm.firmName}
              </span>
            )}
            {c.primaryInsurance && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />{c.primaryInsurance.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />{t('noteCount', { count: c._count.notes })}
            </span>
            <span className="flex items-center gap-1">
              <Stethoscope className="w-3 h-3" />{t('appointmentCount', { count: c._count.appointments })}
            </span>
            <span className="ml-auto">{ageLabel}</span>
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors shrink-0 self-center" />
      </div>
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  // Parse as local date to avoid UTC→local timezone shift (e.g. 2000-01-01 UTC → Dec 31)
  const iso = typeof d === 'string' ? d : d.toISOString();
  const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
  const local = new Date(y, mo - 1, day);
  return local.toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type TFn = ReturnType<typeof useTranslations<'phoenix.patients'>>;

function formatRelative(d: Date | string, t: TFn): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) return t('ageMinutes');
  if (h < 24) return t('ageHours', { h: Math.floor(h) });
  const days = Math.floor(h / 24);
  if (days < 30) return t('ageDays', { d: days });
  const months = Math.floor(days / 30);
  return t('ageMonths', { m: months });
}
