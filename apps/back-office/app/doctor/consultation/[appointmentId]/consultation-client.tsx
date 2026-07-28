'use client';

/**
 * Portal Médico · Consulta — client (D3 shell)
 *
 * Nodos de flujo estilo Day Admission (versión doctor, identidad violet) +
 * contexto del paciente + tabs en el orden confirmado:
 * Triaje · Notas · Laboratorios · Prescripción · Servicios.
 * Notas/Labs/Rx llegan en D4 con la información de Erick.
 */

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Check, ClipboardList, FlaskConical, FileText, Pill, Briefcase,
  HeartPulse, Video,
} from 'lucide-react';
import { PageHeader, EmptyState, TagPill, PersonAvatar } from '@/components/ui-phoenix';

export interface ConsultationTriage {
  heightFt: number | null; heightIn: number | null; heightCm: number | null;
  weightLbs: number | null; weightOz: number | null; weightKg: number | null;
  systolicMmhg: number | null; diastolicMmhg: number | null;
  systolicMmhg2: number | null; diastolicMmhg2: number | null;
  pulseBpm: number | null; pulseBpm2: number | null;
  respiratoryRate: number | null; respiratoryRate2: number | null;
  tempFahrenheit: number | null; tempFahrenheit2: number | null;
  tempCelsius: number | null; tempCelsius2: number | null;
  painScale: number | null;
  o2Saturation: number | null; onRoomAir: boolean; o2Comment: string | null;
  visualAcuityRight: string | null; visualAcuityLeft: string | null;
  visualAcuityBoth: string | null; visionCorrected: boolean;
  chiefComplaint: string | null;
}

export interface ConsultationAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  status: string;
  type: string;
  isOnline: boolean;
  meetingUrl: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  noteStatus: string | null;
  clinicName: string;
  caseCode: string | null;
  /** Verificación del caso — mismas fuentes que Day Admission */
  verification: {
    healthForm: boolean;
    consents: boolean;
    pip: boolean;
    insuranceName: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    sex: string | null;
    phone: string | null;
  };
  triage: ConsultationTriage | null;
}

type Tab = 'triage' | 'notes' | 'labs' | 'rx' | 'services';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

function ageOf(dobIso: string | null): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Campo read-only — misma caja de valor que los inputs del triaje de Day Admission */
function F({ label, value, accent, align = 'center' }: { label: string; value: React.ReactNode; accent?: 'amber'; align?: 'center' | 'left' }): React.ReactElement {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{label}</div>
      <div className={`rounded-lg border border-border bg-bg-0/70 px-3 py-2.5 text-sm font-semibold tabular-nums truncate ${align === 'center' ? 'text-center' : 'text-left'} ${empty ? 'text-text-muted/60' : accent === 'amber' ? 'text-amber' : 'text-text-1'}`}>
        {empty ? '—' : value}
      </div>
    </div>
  );
}

/** Sección de vitales con header cyan + emoji — espejo de Day Admission */
function VSection({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <div className="text-[10px] font-bold text-cyan uppercase tracking-wider flex items-center gap-1.5 mb-2">
        <span>{emoji}</span>{title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

/** Separador de toma (1ª / 2ª) — espejo de Day Admission */
function ReadingDivider({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-cyan uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex-1 h-px bg-bg-3" />
    </div>
  );
}

export function ConsultationClient({ appointment: a }: { appointment: ConsultationAppointment }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [tab, setTab] = React.useState<Tab>('triage');

  const hasTriage = !!a.triage;
  const isInRoom = a.status === 'IN_PROGRESS';
  const isCompleted = a.status === 'COMPLETED';
  const age = ageOf(a.patient.dateOfBirth);
  const tr = a.triage;

  // Nodos de flujo — mismos 4 pasos que Day Admission, punto de vista del doctor
  const steps = [
    { label: t('stepCheckin'),  desc: t('stepCheckinDesc'),  done: !!a.checkedInAt || isInRoom || isCompleted, current: false },
    { label: t('stepTriage'),   desc: t('stepTriageDesc'),   done: hasTriage || isInRoom || isCompleted,      current: false },
    { label: t('stepDoctor'),   desc: t('stepDoctorDesc'),   done: isCompleted,                                current: isInRoom },
    { label: t('stepServices'), desc: t('stepServicesDesc'), done: false,                                      current: isCompleted },
  ];

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'triage',   label: t('tabTriage'),   icon: HeartPulse },
    { id: 'notes',    label: t('tabNotes'),    icon: FileText },
    { id: 'labs',     label: t('tabLabs'),     icon: FlaskConical },
    { id: 'rx',       label: t('tabRx'),       icon: Pill },
    { id: 'services', label: t('tabServices'), icon: Briefcase },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <PersonAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size={12} gradientClass="bg-gradient-to-br from-violet to-[#a78bfa]" />
          <div className="min-w-0">
            <PageHeader
              title={`${a.patient.firstName} ${a.patient.lastName}`}
              subtitle={
                <span className="flex items-center gap-2 flex-wrap">
                  {a.caseCode && <span className="font-mono text-[11px] text-cyan">{a.caseCode}</span>}
                  <span>{timeLabel(a.scheduledFor)} · {a.durationMinutes} min</span>
                  {age != null && <span>· {age} {t('yearsShort')}</span>}
                  {a.patient.sex && <span>· {a.patient.sex}</span>}
                  <span>· {a.clinicName}</span>
                  {a.isOnline && <Video className="w-3.5 h-3.5 text-cyan" />}
                  {isInRoom && <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet border-violet/30" />}
                </span>
              }
            />
          </div>
        </div>
        <Link
          href="/doctor"
          className="h-9 px-3 rounded-md border border-border text-text-2 text-xs font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('consultBack')}
        </Link>
      </div>

      {/* Nodos de flujo — estilo Day Admission, identidad violet */}
      <div className="rounded-lg bg-bg-2/30 px-4 py-3 overflow-x-auto">
        <div className="flex items-center min-w-[560px]">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    s.done
                      ? 'bg-emerald text-white'
                      : s.current
                        ? 'bg-violet text-white'
                        : 'bg-bg-2 text-text-muted border border-border'
                  }`}
                >
                  {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-[12px] font-bold leading-tight ${s.current ? 'text-violet' : s.done ? 'text-emerald' : 'text-text-muted'}`}>
                    {s.label}
                  </div>
                  <div className="text-[9.5px] text-text-muted hidden sm:block">{s.desc}</div>
                </div>
              </div>
              {i < steps.length - 1 && <div className="flex-1 h-px bg-bg-3 mx-3 min-w-[16px]" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tabs — orden confirmado: Triaje · Notas · Laboratorios · Prescripción · Servicios */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === id ? 'text-violet border-violet' : 'text-text-muted border-transparent hover:text-text-1'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Triaje (lectura del TriageRecord del MA) ── */}
      {tab === 'triage' && (
        <div className="space-y-4">
          {/* Verificación — mismos indicadores que ve el asistente en Day Admission */}
          <div className="flex items-center gap-2 flex-wrap">
            <TagPill
              label={`${t('docHealthForm')} ${a.verification.healthForm ? '✓' : '· ' + t('pendingLabel')}`}
              colorClass={a.verification.healthForm ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            <TagPill
              label={`${t('docConsents')} ${a.verification.consents ? '✓' : '· ' + t('pendingLabel')}`}
              colorClass={a.verification.consents ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            <TagPill
              label={`PIP ${a.verification.pip ? '✓' : '· ' + t('notVerified')}`}
              colorClass={a.verification.pip ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            {a.verification.insuranceName ? (
              <TagPill label={`${t('insuranceLabel')}: ${a.verification.insuranceName}`} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
            ) : (
              <TagPill label={t('insuranceNone')} colorClass="bg-amber/15 text-amber border-amber/30" />
            )}
          </div>

          {!hasTriage || !tr ? (
            <EmptyState.Rich icon={ClipboardList} title={t('triageEmptyTitle')} subtitle={t('triageEmptySubtitle')} />
          ) : (
          <div className="rounded-lg bg-bg-2/30 p-4 space-y-5">
            {/* Espejo del formulario TRIAGE VITALS de Day Admission (read-only) */}
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-cyan" />
              {t('triageVitalsTitle')}
            </div>

            {tr.chiefComplaint && (
              <div className="max-w-xl">
                <F label={t('chiefComplaint')} value={tr.chiefComplaint} align="left" />
              </div>
            )}

            <ReadingDivider label={t('triage1stReading')} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              <VSection title={t('secHeight')} emoji="📏">
                <F label={t('fFeet')} value={tr.heightFt} />
                <F label={t('fInches')} value={tr.heightIn} />
                <F label={t('fCm')} value={tr.heightCm} />
              </VSection>
              <VSection title={t('secWeight')} emoji="⚖️">
                <F label={t('fLbs')} value={tr.weightLbs} />
                <F label={t('fOz')} value={tr.weightOz} />
                <F label={t('fKg')} value={tr.weightKg} />
              </VSection>
              <VSection title={t('secBP')} emoji="❤️">
                <F label={t('fSystolic')} value={tr.systolicMmhg} />
                <F label={t('fDiastolic')} value={tr.diastolicMmhg} />
              </VSection>
              <VSection title={t('secHeart')} emoji="🫁">
                <F label={t('fPulse')} value={tr.pulseBpm} />
                <F label={t('fResp')} value={tr.respiratoryRate} />
              </VSection>
              <VSection title={t('secTempPain')} emoji="🌡️">
                <F label={t('fTempF')} value={tr.tempFahrenheit} />
                <F label={t('fTempC')} value={tr.tempCelsius} />
                <F label={t('fPain')} value={tr.painScale} accent={tr.painScale != null && tr.painScale >= 7 ? 'amber' : undefined} />
              </VSection>
              <VSection title={t('secOxygen')} emoji="🫧">
                <F label={t('fO2')} value={tr.o2Saturation} />
                <div className="col-span-1 sm:col-span-2 min-w-0">
                  <F label={t('fComment')} value={tr.o2Comment} />
                  <div className="text-[10px] text-text-muted mt-1.5">
                    {tr.onRoomAir ? `✓ ${t('roomAir')}` : `⚠ ${t('onSupplementalO2')}`}
                  </div>
                </div>
              </VSection>
            </div>

            <ReadingDivider label={t('triage2ndReading')} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              <VSection title={`${t('secBP')} (2)`} emoji="❤️">
                <F label={t('fSystolic')} value={tr.systolicMmhg2} />
                <F label={t('fDiastolic')} value={tr.diastolicMmhg2} />
              </VSection>
              <VSection title={`${t('secHeart')} (2)`} emoji="🫁">
                <F label={t('fPulse')} value={tr.pulseBpm2} />
                <F label={t('fResp')} value={tr.respiratoryRate2} />
              </VSection>
              <VSection title={`${t('secTempPain')} (2)`} emoji="🌡️">
                <F label={t('fTempF')} value={tr.tempFahrenheit2} />
                <F label={t('fTempC')} value={tr.tempCelsius2} />
              </VSection>
              <VSection title={t('secVision')} emoji="👁️">
                <F label={t('fRight')} value={tr.visualAcuityRight} />
                <F label={t('fLeft')} value={tr.visualAcuityLeft} />
                <F label={t('fBoth')} value={tr.visualAcuityBoth} />
                <div className="col-span-2 sm:col-span-3 text-[10px] text-text-muted">
                  {tr.visionCorrected ? `✓ ${t('visionCorrectedFull')}` : `· ${t('visionNotCorrected')}`}
                </div>
              </VSection>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── Tabs en construcción (D4 — con la información de Erick) ── */}
      {tab === 'notes' && (
        <EmptyState.Rich icon={FileText} title={t('comingSoonTitle')} subtitle={t('comingSoonD4')} />
      )}
      {tab === 'labs' && (
        <EmptyState.Rich icon={FlaskConical} title={t('comingSoonTitle')} subtitle={t('comingSoonD4')} />
      )}
      {tab === 'rx' && (
        <EmptyState.Rich icon={Pill} title={t('comingSoonTitle')} subtitle={t('comingSoonD4')} />
      )}
      {tab === 'services' && (
        <EmptyState.Rich icon={Briefcase} title={t('comingSoonTitle')} subtitle={t('servicesSoon')} />
      )}
    </div>
  );
}
