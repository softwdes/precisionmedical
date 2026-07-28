'use client';

/**
 * Portal Médico · Mi Día (B.17) — client
 *
 * Diseño aprobado por gerencia: hero "Siguiente paciente" (gradiente emerald→cyan),
 * cola del día con estados, bloque amber "Acción requerida" (notas sin firmar).
 * Identidad del módulo: violet (Regla #5).
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CalendarCheck2, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Hourglass, RefreshCw, Sun, Video, FileSignature, ExternalLink,
} from 'lucide-react';
import { PageHeader, KpiCard, EmptyState, TagPill, PersonAvatar, DatePicker } from '@/components/ui-phoenix';

export interface MyDayAppointment {
  id: string;
  scheduledFor: string; // ISO
  durationMinutes: number;
  status: string;
  type: string;
  isOnline: boolean;
  meetingUrl: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  hasTriage: boolean;
  /** Mini-resumen de vitales del triaje (null si no hay registro) */
  triage: { systolic: number | null; diastolic: number | null; pulse: number | null; pain: number | null } | null;
  noteStatus: string | null; // DRAFT | SIGNED | null
  patientFirstName: string;
  patientLastName: string;
  caseCode: string | null;
  clinicName: string;
}

export interface UnsignedNote {
  appointmentId: string;
  patientName: string;
  date: string; // ISO
}

interface Props {
  doctorName: string;
  appointments: MyDayAppointment[];
  unsignedNotes: UnsignedNote[];
  clinicalUrl: string | null;
  /** Día visualizado (YYYY-MM-DD, Denver) y navegación */
  dateKey: string;
  isToday: boolean;
  prevDate: string;
  nextDate: string;
}

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'PENDING'];

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Hoy en Denver (YYYY-MM-DD) — para marcar "hoy" en el DatePicker */
function todayKeyClient(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function MyDayClient({ doctorName, appointments, unsignedNotes, clinicalUrl, dateKey, isToday, prevDate, nextDate }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [now, setNow] = React.useState(() => Date.now());
  const [isRefreshing, startRefresh] = React.useTransition();
  const [attending, setAttending] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sincronización en vivo con Day Admission: el check-in/triaje del asistente
  // aparece solo — polling 30s (solo viendo HOY) + refresh al recuperar el foco.
  React.useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => router.refresh(), 30_000);
    const onFocus = (): void => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [isToday, router]);

  const sorted = [...appointments].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const completed = sorted.filter(a => a.status === 'COMPLETED');
  const active = sorted.filter(a => ACTIVE.includes(a.status));
  // Llegada = status de llegada O checkedInAt registrado — defensa contra
  // degradaciones de status (bug real: un confirm tardío pisó IN_PROGRESS).
  const arrived = (a: MyDayAppointment): boolean =>
    a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS' || !!a.checkedInAt;
  const waiting = active.filter(arrived);

  // Hero solo aplica al día de HOY: en consulta > en espera con triaje > en espera > próxima futura.
  // En días pasados/futuros se muestra la lista completa sin hero ni CTA.
  const hero = isToday
    ? (active.find(a => a.status === 'IN_PROGRESS')
      ?? active.find(a => arrived(a) && a.hasTriage)
      ?? active.find(arrived)
      ?? active.find(a => new Date(a.scheduledFor).getTime() >= now - 15 * 60_000)
      ?? active[0]
      ?? null)
    : null;

  const queue = active.filter(a => a.id !== hero?.id);
  const minsTo = hero ? Math.round((new Date(hero.scheduledFor).getTime() - now) / 60_000) : 0;
  // Regla de negocio (Erick 2026-07-28): listo para atender = check-in + triaje.
  // Si el asistente ya lo pasó a sala (IN_PROGRESS), el doctor SIEMPRE puede atender —
  // el wizard de admisión marca el paso de triaje por status, con o sin vitales.
  // La firma de asistencia (B.14.1) aún no existe en el flujo → solo informativa.
  const heroArrived = !!hero && arrived(hero);
  const heroReady = !!hero && (hero.status === 'IN_PROGRESS' || (arrived(hero) && hero.hasTriage));
  const noteHref = (apptId: string): string | null =>
    clinicalUrl ? `${clinicalUrl}/visit/${apptId}` : null;

  // Atender: abre la nota y, si el paciente sigue en espera, lo pasa a sala
  // (IN_PROGRESS) — el asistente lo ve como "With Dr." en Day Admission.
  const handleAttend = async (): Promise<void> => {
    if (!hero) return;
    const href = noteHref(hero.id);
    if (href) window.open(href, '_blank', 'noopener');
    if (hero.status !== 'IN_PROGRESS') {
      setAttending(true);
      try {
        await fetch(`/api/admin/admission/${hero.id}/admit`, { method: 'POST' });
      } catch { /* el refresh mostrará el estado real */ }
      setAttending(false);
      router.refresh();
    }
  };

  const statusPill = (a: MyDayAppointment): React.ReactElement => {
    if (a.status === 'IN_PROGRESS') return <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet border-violet/30" />;
    if (arrived(a)) {
      return a.hasTriage
        ? <TagPill label={t('triageDone')} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
        : <TagPill label={t('statusWaiting')} colorClass="bg-amber/15 text-amber border-amber/30" />;
    }
    return <TagPill label={t('statusPending')} colorClass="bg-amber/15 text-amber border-amber/30" />;
  };

  return (
    <div className="space-y-6">
      {/* Header + navegación de fecha en la misma línea (gana espacio vertical).
          Controles táctiles h-10 (iPad); en mobile hacen wrap bajo el título. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={t('greeting', { name: doctorName })}
          subtitle={t('myDaySubtitle', { count: active.length + completed.length })}
        />
        {/* Date navigator — mismo patrón que Day Admission, identidad violet */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            aria-label={t('refresh')}
            title={t('refresh')}
            className="w-9 h-9 rounded-md border border-border hover:bg-white/5 text-text-muted hover:text-text-1 flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1 rounded-md border border-border bg-bg-2/40 h-9 px-1">
            <Link
              href={`/doctor?date=${prevDate}`}
              aria-label={t('dayPrev')}
              className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('dayPrevShort')}</span>
            </Link>
            <DatePicker
              value={dateKey}
              onChange={(k) => router.push(k === todayKeyClient() ? '/doctor' : `/doctor?date=${k}`)}
              accent="violet"
              todayLabel={t('dayToday')}
              todayKey={todayKeyClient()}
              className="[&>button]:border-0 [&>button]:bg-transparent [&>button]:h-7 [&>button]:text-sm [&>button]:font-semibold"
            />
            <Link
              href={`/doctor?date=${nextDate}`}
              aria-label={t('dayNext')}
              className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
            >
              <span className="hidden sm:inline">{t('dayNextShort')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {!isToday && (
            <Link
              href="/doctor"
              className="h-9 px-3 rounded-md border border-violet/40 text-violet text-xs font-semibold hover:bg-violet/10 transition-colors flex items-center"
            >
              {t('dayToday')}
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard compact label={t(isToday ? 'kpiToday' : 'kpiDay')} value={active.length + completed.length} color="text-violet" icon={CalendarCheck2} iconBg="bg-violet/10" iconColor="text-violet" />
        <KpiCard compact label={t('kpiCompleted')} value={completed.length} color="text-emerald" icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard compact label={t('kpiWaiting')} value={waiting.length} color="text-cyan" icon={Hourglass} iconBg="bg-cyan/10" iconColor="text-cyan" />
        <KpiCard compact label={t('kpiUnsigned')} value={unsignedNotes.length} color={unsignedNotes.length > 0 ? 'text-amber' : 'text-text-1'} icon={Clock3} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      {/* Hero — Siguiente paciente (gradiente emerald→cyan del mockup B.17) */}
      {hero ? (
        <div
          className="rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(6,182,212,0.10))',
            borderColor: 'rgba(16,185,129,0.40)',
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <PersonAvatar firstName={hero.patientFirstName} lastName={hero.patientLastName} size={12} gradientClass="bg-gradient-to-br from-emerald to-cyan" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-emerald">
                {hero.status === 'IN_PROGRESS' ? t('statusInProgress') : t('heroNext')}
              </div>
              <div className="text-xl font-bold text-text-1 truncate">
                {hero.patientFirstName} {hero.patientLastName}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {hero.caseCode && <span className="font-mono text-[11px] text-cyan">{hero.caseCode}</span>}
                <span className="text-text-2">{timeLabel(hero.scheduledFor)}</span>
                {minsTo > 0 && minsTo < 180 && (
                  <span className="text-emerald font-semibold text-[12px]">{t('inMinutes', { min: minsTo })}</span>
                )}
                {hero.isOnline && <Video className="w-3.5 h-3.5 text-cyan" />}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span className={hero.hasTriage ? 'text-emerald' : ''}>{hero.hasTriage ? t('triageDone') : t('triagePendingShort')}</span>
                <span>·</span>
                <span>{hero.attendanceSignedAt ? t('attendanceSigned') : t('attendancePending')}</span>
                <span>·</span>
                <span>{hero.clinicName}</span>
              </div>
              {/* Mini-resumen del triaje — el doctor ve los vitales sin salir de Mi Día */}
              {hero.hasTriage && hero.triage && (
                <div className="flex items-center gap-3 mt-1.5 text-[11px] flex-wrap">
                  {hero.triage.systolic != null && hero.triage.diastolic != null && (
                    <span className="text-text-2"><b className="text-text-1">{t('vitBP')}</b> {hero.triage.systolic}/{hero.triage.diastolic}</span>
                  )}
                  {hero.triage.pulse != null && (
                    <span className="text-text-2"><b className="text-text-1">{t('vitPulse')}</b> {hero.triage.pulse} bpm</span>
                  )}
                  {hero.triage.pain != null && (
                    <span className={hero.triage.pain >= 7 ? 'text-amber font-semibold' : 'text-text-2'}>
                      <b className={hero.triage.pain >= 7 ? 'text-amber' : 'text-text-1'}>{t('vitPain')}</b> {hero.triage.pain}/10
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {heroReady && noteHref(hero.id) ? (
            <button
              type="button"
              onClick={() => void handleAttend()}
              disabled={attending}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold w-full sm:w-auto disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg, #10B981, #14b8a6)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
            >
              {t('attendNow')} →
            </button>
          ) : (
            <div className="shrink-0 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2.5 text-[11px] text-amber max-w-[220px]">
              {!heroArrived ? t('guardrailCheckin') : t('guardrailTriage')}
            </div>
          )}
        </div>
      ) : (active.length + completed.length === 0) ? (
        <EmptyState.Rich icon={Sun} title={t('emptyDayTitle')} subtitle={t('emptyDaySubtitle')} />
      ) : null}

      {/* Cola del día */}
      {queue.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            {t('upcomingTitle')}
          </div>
          <div className="space-y-1.5">
            {queue.map(a => (
              <div key={a.id} className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3">
                <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-1 truncate">
                    {a.patientFirstName} {a.patientLastName}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-cyan hidden sm:inline">{a.caseCode ?? ''}</span>
                  {a.isOnline && <Video className="w-3 h-3 text-cyan inline ml-1.5 -mt-0.5" />}
                </div>
                {statusPill(a)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atendidas hoy */}
      {completed.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            {t('completedTitle')}
          </div>
          <div className="space-y-1.5">
            {completed.map(a => (
              <div key={a.id} className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3 opacity-60">
                <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                <span className="flex-1 min-w-0 text-sm text-text-1 truncate">
                  {a.patientFirstName} {a.patientLastName}
                </span>
                <TagPill label={t('statusDone')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acción requerida — notas sin firmar */}
      {unsignedNotes.length > 0 && (
        <div className="rounded-xl border border-amber/30 bg-amber/[0.08] p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber mb-2 flex items-center gap-1.5">
            <FileSignature className="w-3.5 h-3.5" />
            {t('actionRequired')}
          </div>
          <div className="space-y-1">
            {unsignedNotes.map(n => (
              <div key={n.appointmentId} className="flex items-center justify-between gap-3 py-1.5 border-t border-amber/15 text-sm">
                <span className="text-text-2 min-w-0 truncate">
                  {t('unsignedNoteRow', {
                    name: n.patientName,
                    date: new Date(n.date).toLocaleDateString('es-US', { day: 'numeric', month: 'short', timeZone: 'America/Denver' }),
                  })}
                </span>
                {noteHref(n.appointmentId) && (
                  <a
                    href={noteHref(n.appointmentId)!}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-amber hover:underline"
                  >
                    {t('signNow')} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acceso rápido al calendario */}
      <div className="text-[12px] text-text-muted">
        <Link href="/doctor/calendar" className="text-violet hover:underline font-semibold">
          {t('goToCalendar')} →
        </Link>
      </div>
    </div>
  );
}
