'use client';
import { localeApp } from '@/lib/fechas';

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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Check, ClipboardList, FlaskConical, FileText, Pill, Briefcase, Bandage,
  HeartPulse, Video,
} from 'lucide-react';
import { PageHeader, EmptyState, TagPill, PersonAvatar } from '@/components/ui-phoenix';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { CoverageDTO } from '@/lib/coverage';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { PatientContextPanel, type PatientContext } from './patient-context-panel';
import { LabsTab } from '@/components/visit/labs-tab';
import { VisitSummary } from '@/components/visit/visit-summary';
import { MedicationHistory } from '@/components/visit/medication-history';
import { RxIntegrationStatus } from '@/components/visit/rx-integration-status';
import { BracesTab } from '@/components/visit/braces-tab';

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
  /** El doctor ya terminó con el paciente (nodo 4) — no cierra la cita */
  doctorDoneAt: string | null;
  /** El asistente cerró la visita — cierra el reloj de tiempo en clínica */
  checkedOutAt: string | null;
  clinicName: string;
  caseId: string | null;
  caseCode: string | null;
  /** ¿Quién paga? Decide qué catálogo abre primero el picker de cargos. */
  coverage: CoverageDTO;
  /** Verificación del caso — mismas fuentes que Day Admission */
  verification: {
    healthForm: boolean;
    consents: boolean;
    pip: boolean;
    insuranceName: string | null;
  };
  /** Payload del panel de servicios compartido con Day Admission */
  servicesPanel: React.ComponentProps<typeof AppointmentDetailPanel>['appointment'];
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    sex: string | null;
    phone: string | null;
  };
  triage: ConsultationTriage | null;
}

type Tab = 'notes' | 'labs' | 'rx' | 'services' | 'braces';
/** 4 nodos: el 4 es Resumen y salida (el cobro sigue siendo del asistente) */
type StepView = 1 | 2 | 3 | 4;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), {
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
  // Clases idénticas al VInput del triaje de Day Admission (read-only)
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{label}</div>
      <div className={`w-full bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-[13px] font-semibold tabular-nums truncate ${align === 'center' ? 'text-center' : 'text-left'} ${empty ? 'text-text-muted' : accent === 'amber' ? 'text-amber' : 'text-text-1'}`}>
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

export function ConsultationClient({
  appointment: a, note, templates, userId, patientContext,
}: {
  appointment: ConsultationAppointment;
  note: VisitNoteData | null;
  templates: PickableTemplate[];
  userId: string | null;
  patientContext: PatientContext;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();

  const hasTriage = !!a.triage;
  const isInRoom = a.status === 'IN_PROGRESS';
  const isCompleted = a.status === 'COMPLETED';
  const age = ageOf(a.patient.dateOfBirth);
  const tr = a.triage;

  // Paso actual del flujo (mismo criterio que Day Admission).
  // Si el doctor ya terminó, el paso actual es el Resumen.
  const currentStep = (a.doctorDoneAt ? 4 : isInRoom || isCompleted || hasTriage ? 3 : 2) as StepView;
  // Navegación libre entre nodos — arranca en el paso actual
  const [view, setView] = React.useState<StepView>(currentStep);
  const [tab, setTab] = React.useState<Tab>('notes');
  const isCurrent = (n: StepView): boolean => n === currentStep;

  // Nodos del flujo del doctor — 4 pasos (el cobro sigue siendo del asistente).
  // `short` es la etiqueta de mobile: los 4 pasos tienen que entrar en 375px
  // sin scroll horizontal (antes el riel medía 712px y el paso 4 quedaba fuera).
  const steps: Array<{ n: StepView; label: string; short: string; desc: string; done: boolean; current: boolean }> = [
    { n: 1, label: t('stepCheckin'), short: t('stepCheckinShort'), desc: t('stepCheckinDesc'), done: !!a.checkedInAt || isInRoom || isCompleted, current: isCurrent(1) },
    { n: 2, label: t('stepTriage'),  short: t('stepTriageShort'),  desc: t('stepTriageDesc'),  done: hasTriage || isInRoom || isCompleted,      current: isCurrent(2) },
    { n: 3, label: t('stepDoctor'),  short: t('stepDoctorShort'),  desc: t('stepDoctorDesc'),  done: !!a.doctorDoneAt || isCompleted,            current: isCurrent(3) },
    { n: 4, label: t('stepSummary'), short: t('stepSummaryShort'), desc: t('stepSummaryDesc'), done: !!a.doctorDoneAt,                           current: isCurrent(4) },
  ];

  // Tabs del área de trabajo del doctor (nodo 3) — Servicios a la derecha de Prescripción
  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'notes',    label: t('tabNotes'),    icon: FileText },
    { id: 'labs',     label: t('tabLabs'),     icon: FlaskConical },
    { id: 'rx',       label: t('tabRx'),       icon: Pill },
    { id: 'services', label: t('tabServices'), icon: Briefcase },
    { id: 'braces',   label: t('tabBraces'),   icon: Bandage },
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
                  {isInRoom && <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet-text border-violet/30" />}
                  {/* Quién paga, en la línea que el doctor ya lee. Editable: si
                      está sin definir, se resuelve acá sin salir de la consulta. */}
                  <CoverageChip caseId={a.caseId} coverage={a.coverage} />
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

      {/* Nodos de flujo — navegación LIBRE, estilo Day Admission (clic para ver cada paso).
          Mobile/iPad vertical: grid de 4 celdas (icono arriba, etiqueta corta abajo) —
          los 4 pasos entran en 375px sin swipe. Desde lg: el riel horizontal con
          descripciones y conectores, igual que Day Admission. */}
      <div className="rounded-lg bg-bg-2/30 px-2 py-2 sm:px-4 sm:py-3">
        <div className="grid grid-cols-4 gap-1 lg:flex lg:items-center">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <button
                type="button"
                onClick={() => setView(s.n)}
                aria-current={view === s.n ? 'step' : undefined}
                className={`flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-2 min-h-11 lg:min-h-0 lg:shrink-0 rounded-md px-1 py-1.5 lg:px-2 lg:-mx-1 transition-all text-center lg:text-left ${
                  view === s.n ? 'bg-bg-2/70 ring-1 ring-violet/40' : 'hover:bg-white/[0.03]'
                }`}
              >
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
                <div className="min-w-0 w-full lg:w-auto">
                  <div className={`text-[10px] lg:text-[12px] font-bold leading-tight truncate ${s.current ? 'text-violet-text' : s.done ? 'text-emerald' : 'text-text-muted'}`}>
                    <span className="lg:hidden">{s.short}</span>
                    <span className="hidden lg:inline">{s.label}</span>
                  </div>
                  <div className="text-[9.5px] text-text-muted hidden lg:block">{s.desc}</div>
                </div>
              </button>
              {i < steps.length - 1 && <div className="hidden lg:block flex-1 h-px bg-bg-3 mx-3 min-w-[16px]" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Banner al ver un paso distinto al actual — igual que Day Admission */}
      {view !== currentStep && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-amber">{t('viewingStep', { n: view })}</span>
          <button
            type="button"
            onClick={() => setView(currentStep)}
            className="text-[11px] font-semibold text-amber hover:underline shrink-0"
          >
            ← {t('backToCurrent')}
          </button>
        </div>
      )}

      {/* ── Nodo 1: Check-in — resumen de llegada ── */}
      {view === 1 && (
        <div className="rounded-lg bg-bg-2/30 p-4 space-y-3 max-w-xl">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald" />
            {t('stepCheckin')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F
              label={t('stepCheckin')}
              value={a.checkedInAt ? timeLabel(a.checkedInAt) : null}
            />
            <F
              label={t('attendanceLabel')}
              value={a.attendanceSignedAt ? timeLabel(a.attendanceSignedAt) : null}
            />
          </div>
          {!a.checkedInAt && (
            <div className="text-[11px] text-amber">{t('guardrailCheckin')}</div>
          )}
        </div>
      )}

      {/* ── Nodo 2: Triaje y verificación (lectura del TriageRecord del MA) ── */}
      {view === 2 && (
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

      {/* ── Nodo 3: área de trabajo del doctor ──
          Layout de 2 columnas como el v2: contexto clínico del paciente a la
          izquierda (solo lectura) + tabs de trabajo a la derecha.
          En mobile/iPad vertical el contexto se apila arriba. */}
      {view === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 items-start">
          <div className="lg:sticky lg:top-4">
            <PatientContextPanel patient={patientContext} />
          </div>
          <div className="space-y-4 min-w-0">
          {/* Tabs del doctor — mobile: grid de 4 (icono arriba, etiqueta abajo),
              mismo patrón que el bottom nav. Antes era una fila de 402px dentro
              de 343px y "Servicios" quedaba cortada. Desde sm: fila normal. */}
          <div className="grid grid-cols-4 sm:flex sm:gap-1 border-b border-border">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 min-h-11 sm:min-h-0 px-1 sm:px-3.5 py-2 text-[10px] sm:text-[13px] font-semibold border-b-2 -mb-px transition-colors text-center sm:whitespace-nowrap ${
                  tab === id ? 'text-violet-text border-violet' : 'text-text-muted border-transparent hover:text-text-1'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="max-w-full truncate">{label}</span>
              </button>
            ))}
          </div>
          {tab === 'notes' && (
            <VisitNoteEditor
              appointmentId={a.id}
              note={note}
              templates={templates}
              userId={userId}
              /* El nodo 4 lee `note` del payload del SERVER. Sin avisar, el
                 doctor escribía diagnósticos, iba al Resumen y el checklist le
                 decía que faltaban. Day Admission ya recargaba con onSaved; esto
                 iguala el lado del doctor. */
              onSaved={() => router.refresh()}
            />
          )}
          {tab === 'labs' && (
            <LabsTab
              appointmentId={a.id}
              userId={userId}
              defaultProviderId={a.servicesPanel.provider?.id ?? null}
            />
          )}
          {tab === 'rx' && (
            <div className="space-y-4">
              <RxIntegrationStatus appointmentId={a.id} />
              <MedicationHistory appointmentId={a.id} medications={patientContext.history.medications} />
            </div>
          )}
          {/* Servicios — mismo panel de Day Admission, SIN botón de pagos
              (el cobro lo hace el asistente en su lado) */}
          {tab === 'services' && (
            <AppointmentDetailPanel
              inline
              noBorder
              hidePayments
              initialTab="services"
              appointment={a.servicesPanel}
              coverage={a.coverage}
              onClose={() => {}}
              onRefresh={() => router.refresh()}
            />
          )}
          {/* Férulas / DME — mismo componente que usa el asistente en Day Admission */}
          {tab === 'braces' && <BracesTab appointmentId={a.id} />}
          </div>
        </div>
      )}

      {/* ── Nodo 4: Resumen y salida ── */}
      {view === 4 && (
        <VisitSummary
          appointmentId={a.id}
          note={note}
          triage={a.triage}
          services={(a.servicesPanel.plannedServiceCodes ?? []) as Array<{ id: string; code: string; description: string; fee?: number }>}
          checkedInAt={a.checkedInAt}
          doctorDoneAt={a.doctorDoneAt}
          checkedOutAt={a.checkedOutAt}
          onFix={(target) => { setTab(target); setView(3); }}
          followUp={a.servicesPanel.case ? {
            caseId: a.servicesPanel.case.id,
            caseCode: a.servicesPanel.case.caseCode,
            patient: { firstName: a.patient.firstName, lastName: a.patient.lastName },
            defaultProviderId: a.servicesPanel.provider?.id ?? null,
          } : null}
        />
      )}
    </div>
  );
}
