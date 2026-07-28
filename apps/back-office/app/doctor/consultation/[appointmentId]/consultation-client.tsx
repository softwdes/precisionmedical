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
  heightFt: number | null; heightIn: number | null;
  weightLbs: number | null; weightOz: number | null;
  systolicMmhg: number | null; diastolicMmhg: number | null;
  systolicMmhg2: number | null; diastolicMmhg2: number | null;
  pulseBpm: number | null; pulseBpm2: number | null;
  respiratoryRate: number | null; respiratoryRate2: number | null;
  tempFahrenheit: number | null; tempFahrenheit2: number | null;
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

/** Stat box de vital — solo se muestra si hay valor */
function Vital({ label, value, accent }: { label: string; value: React.ReactNode; accent?: 'amber' }): React.ReactElement {
  return (
    <div className="rounded-md bg-bg-2/40 p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{label}</div>
      <div className={`text-lg font-bold mt-0.5 tabular-nums ${accent === 'amber' ? 'text-amber' : 'text-text-1'}`}>{value}</div>
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
        !hasTriage || !tr ? (
          <EmptyState.Rich icon={ClipboardList} title={t('triageEmptyTitle')} subtitle={t('triageEmptySubtitle')} />
        ) : (
          <div className="space-y-4">
            {tr.chiefComplaint && (
              <div className="rounded-lg bg-bg-2/30 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('chiefComplaint')}</div>
                <div className="text-sm text-text-1">{tr.chiefComplaint}</div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {tr.systolicMmhg != null && tr.diastolicMmhg != null && (
                <Vital label={t('vitBP')} value={`${tr.systolicMmhg}/${tr.diastolicMmhg} mmHg`} />
              )}
              {tr.systolicMmhg2 != null && tr.diastolicMmhg2 != null && (
                <Vital label={t('vitBP2')} value={`${tr.systolicMmhg2}/${tr.diastolicMmhg2} mmHg`} />
              )}
              {tr.pulseBpm != null && <Vital label={t('vitPulse')} value={`${tr.pulseBpm} bpm`} />}
              {tr.pulseBpm2 != null && <Vital label={t('vitPulse2')} value={`${tr.pulseBpm2} bpm`} />}
              {tr.respiratoryRate != null && <Vital label={t('vitResp')} value={`${tr.respiratoryRate}/min`} />}
              {tr.respiratoryRate2 != null && <Vital label={t('vitResp2')} value={`${tr.respiratoryRate2}/min`} />}
              {tr.tempFahrenheit != null && <Vital label={t('vitTemp')} value={`${tr.tempFahrenheit} °F`} />}
              {tr.tempFahrenheit2 != null && <Vital label={t('vitTemp2')} value={`${tr.tempFahrenheit2} °F`} />}
              {tr.painScale != null && (
                <Vital label={t('vitPain')} value={`${tr.painScale}/10`} accent={tr.painScale >= 7 ? 'amber' : undefined} />
              )}
              {tr.o2Saturation != null && (
                <Vital label={t('vitO2')} value={`${tr.o2Saturation}% ${tr.onRoomAir ? `· ${t('roomAir')}` : ''}`} />
              )}
              {(tr.weightLbs != null || tr.weightOz != null) && (
                <Vital label={t('vitWeight')} value={`${tr.weightLbs ?? 0} lb ${tr.weightOz ? `${tr.weightOz} oz` : ''}`} />
              )}
              {(tr.heightFt != null || tr.heightIn != null) && (
                <Vital label={t('vitHeight')} value={`${tr.heightFt ?? 0}' ${tr.heightIn ?? 0}"`} />
              )}
              {(tr.visualAcuityRight ?? tr.visualAcuityLeft ?? tr.visualAcuityBoth) && (
                <Vital
                  label={`${t('vitVision')}${tr.visionCorrected ? ` (${t('visionCorrected')})` : ''}`}
                  value={[
                    tr.visualAcuityRight && `OD ${tr.visualAcuityRight}`,
                    tr.visualAcuityLeft && `OI ${tr.visualAcuityLeft}`,
                    tr.visualAcuityBoth && `AO ${tr.visualAcuityBoth}`,
                  ].filter(Boolean).join(' · ')}
                />
              )}
            </div>
            {tr.o2Comment && (
              <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
                O₂: {tr.o2Comment}
              </div>
            )}
          </div>
        )
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
