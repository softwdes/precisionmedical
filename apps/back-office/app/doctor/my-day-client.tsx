'use client';
import { localeApp } from '@/lib/fechas';

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
  CalendarCheck2, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Hourglass, RefreshCw, Sun, Video,
} from 'lucide-react';
import { PageHeader, KpiCard, EmptyState, TagPill, PersonAvatar, DatePicker } from '@/components/ui-phoenix';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import { OnlineBadge, OnlineMeetingBox } from '@/components/visit/online-visit';
import { PendingNotes } from '@/components/visit/pending-notes';
import { useLiveSync } from '@/lib/use-live-sync';
import { LiveStatus } from '@/components/ui-phoenix/live-status';
import type { CoverageDTO } from '@/lib/coverage';

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
  /** El doctor ya terminó con este paciente (el asistente cierra la cita) */
  doctorDoneAt: string | null;
  patientFirstName: string;
  patientLastName: string;
  caseId: string | null;
  caseCode: string | null;
  /** ¿Quién paga? Referencia para el doctor antes de entrar a la consulta. */
  coverage: CoverageDTO;
  clinicName: string;
}

interface Props {
  doctorName: string;
  appointments: MyDayAppointment[];
  /** Notas sin cerrar del doctor — mismo criterio que la cola de abajo */
  unsignedTotal: number;
  /** Día visualizado (YYYY-MM-DD, Denver) y navegación */
  dateKey: string;
  isToday: boolean;
  prevDate: string;
  nextDate: string;
}

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'PENDING'];

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Hoy en Denver (YYYY-MM-DD) — para marcar "hoy" en el DatePicker */
function todayKeyClient(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function MyDayClient({
  doctorName, appointments, unsignedTotal, dateKey, isToday, prevDate, nextDate,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [now, setNow] = React.useState(() => Date.now());
  const [isRefreshing, startRefresh] = React.useTransition();
  const [attending, setAttending] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sincronización en vivo con Day Admission por pulso: el check-in y el triaje
  // del asistente aparecen solos. Antes era un `router.refresh()` cada 30 s — un
  // re-render del server component completo, cambiara algo o no. Ahora el pulso
  // (~60 bytes) decide si vale la pena.
  const { lastSyncedAt, failing, syncNow } = useLiveSync({
    url: `/api/admin/pulse?date=${dateKey}`,
    enabled: isToday,
    onChange: () => router.refresh(),
  });

  const sorted = [...appointments].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const completed = sorted.filter(a => a.status === 'COMPLETED');
  const active = sorted.filter(a => ACTIVE.includes(a.status));
  // Llegada = status de llegada O checkedInAt registrado — defensa contra
  // degradaciones de status (bug real: un confirm tardío pisó IN_PROGRESS).
  const arrived = (a: MyDayAppointment): boolean =>
    a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS' || !!a.checkedInAt;
  const waiting = active.filter(a => arrived(a) && !a.doctorDoneAt);

  // Hero solo aplica al día de HOY: en consulta > en espera con triaje > en espera > próxima futura.
  // Los que el doctor ya terminó salen del hero — le toca al asistente cobrarlos.
  // En días pasados/futuros se muestra la lista completa sin hero ni CTA.
  const pending = active.filter(a => !a.doctorDoneAt);
  const hero = isToday
    ? (pending.find(a => a.status === 'IN_PROGRESS')
      ?? pending.find(a => arrived(a) && a.hasTriage)
      ?? pending.find(arrived)
      ?? pending.find(a => new Date(a.scheduledFor).getTime() >= now - 15 * 60_000)
      ?? pending[0]
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
  // La consulta vive DENTRO del portal (antes apuntaba a clinical.lienmaster.net,
  // que no está deployado y devolvía error de DNS).
  const consultHref = (apptId: string): string => `/doctor/consultation/${apptId}`;

  // Atender: pasa al paciente a sala si hace falta (el asistente lo ve como
  // "With Dr." en Day Admission) y abre la Consulta DENTRO del portal.
  const handleAttend = async (): Promise<void> => {
    if (!hero) return;
    if (hero.status !== 'IN_PROGRESS') {
      setAttending(true);
      try {
        await fetch(`/api/admin/admission/${hero.id}/admit`, { method: 'POST' });
      } catch { /* la consulta mostrará el estado real */ }
      setAttending(false);
    }
    router.push(`/doctor/consultation/${hero.id}`);
  };

  const statusPill = (a: MyDayAppointment): React.ReactElement => {
    // El doctor ya terminó — falta que el asistente cobre y cierre la cita
    if (a.doctorDoneAt) return <TagPill label={t('statusDoctorDone')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />;
    if (a.status === 'IN_PROGRESS') return <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet-text border-violet/30" />;
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
          {/* Frescura: hace cuánto se sabe que está al día, y aviso ámbar si dejó
              de sincronizar. Solo hoy — en otros días no hay nada que sincronizar. */}
          {isToday && (
            <LiveStatus lastSyncedAt={lastSyncedAt} failing={failing} onRetry={syncNow} />
          )}
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
              className="h-9 px-3 rounded-md border border-violet/40 text-violet-text text-xs font-semibold hover:bg-violet/10 transition-colors flex items-center"
            >
              {t('dayToday')}
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard compact label={t(isToday ? 'kpiToday' : 'kpiDay')} value={active.length + completed.length} color="text-violet-text" icon={CalendarCheck2} iconBg="bg-violet/10" iconColor="text-violet-text" />
        <KpiCard compact label={t('kpiCompleted')} value={completed.length} color="text-emerald" icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard compact label={t('kpiWaiting')} value={waiting.length} color="text-cyan" icon={Hourglass} iconBg="bg-cyan/10" iconColor="text-cyan" />
        <KpiCard compact label={t('kpiUnsigned')} value={unsignedTotal} color={unsignedTotal > 0 ? 'text-amber' : 'text-text-1'} icon={Clock3} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      {/* Hero — Siguiente paciente (gradiente emerald→cyan del mockup B.17) */}
      {hero ? (
        <div
          className="rounded-xl border p-4 sm:p-5 space-y-3"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(6,182,212,0.10))',
            borderColor: 'rgba(16,185,129,0.40)',
          }}
        >
         <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* La zona del paciente abre la consulta en lectura aunque no haya
              check-in — el guardrail aplica a ATENDER, no a ver los datos */}
          <Link
            href={consultHref(hero.id)}
            title={t('openConsultation')}
            className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-white/[0.04] transition-colors"
          >
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
                {hero.isOnline && <OnlineBadge />}
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
          </Link>
          {/* Fuera del <Link> a propósito: un <button> dentro de un <a> es HTML
              inválido y el click quedaría peleado entre navegar y abrir el
              diálogo. Acá es editable porque es el paciente que el doctor tiene
              enfrente — en la cola de abajo va en modo lectura. */}
          <div className="shrink-0">
            <CoverageChip caseId={hero.caseId} coverage={hero.coverage} size="md" />
          </div>
          {heroReady ? (
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

          {/* El enlace va FUERA del <Link> del paciente: tiene un botón y un
              <a>, y anidarlos dentro de otro <a> es HTML inválido — el clic
              quedaría peleado entre navegar a la consulta y copiar. */}
          {hero.isOnline && <OnlineMeetingBox meetingUrl={hero.meetingUrl} />}
        </div>
      ) : (active.length + completed.length === 0) ? (
        <EmptyState.Rich icon={Sun} title={t('emptyDayTitle')} subtitle={t('emptyDaySubtitle')} />
      ) : null}

      {/* Cola del día */}
      {queue.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            {t(isToday ? 'upcomingTitle' : 'dayAppointmentsTitle')}
          </div>
          <div className="space-y-1.5">
            {queue.map(a => (
              <Link
                key={a.id}
                href={consultHref(a.id)}
                title={t('openConsultation')}
                className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3 hover:border-violet/40 hover:bg-violet/[0.04] transition-colors group"
              >
                <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-1 truncate">
                    {a.patientFirstName} {a.patientLastName}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-cyan hidden sm:inline">{a.caseCode ?? ''}</span>
                  {/* Solo la marca: la fila entera es un <Link> y un botón de
                      copiar adentro sería HTML inválido. El enlace se copia en
                      el hero o entrando a la consulta. */}
                  {a.isOnline && <span className="ml-1.5 align-middle inline-flex"><OnlineBadge compact /></span>}
                </div>
                {/* Solo lectura: la fila entera es un link y quien corrige la
                    cobertura es recepción o el asistente desde Day Admission.
                    El doctor la resuelve en el hero o entrando a la consulta. */}
                <span className="hidden sm:inline">
                  <CoverageChip caseId={a.caseId} coverage={a.coverage} editable={false} />
                </span>
                {statusPill(a)}
                <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-violet-text shrink-0 transition-colors" />
              </Link>
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
              <Link
                key={a.id}
                href={consultHref(a.id)}
                title={t('openConsultation')}
                className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3 opacity-60 hover:opacity-100 hover:border-violet/40 hover:bg-violet/[0.04] transition-all group"
              >
                <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                <span className="flex-1 min-w-0 text-sm text-text-1 truncate">
                  {a.patientFirstName} {a.patientLastName}
                </span>
                <TagPill label={t('statusDone')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
                <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-violet-text shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Notas sin cerrar — cola completa, no un tope de 8.
          La nota puede quedar abierta MESES (solo el doctor la cierra), así que
          esto tiene que mostrar todo el pendiente y su antigüedad, no las últimas
          ocho. Incluye las visitas atendidas sin ninguna nota escrita, que antes
          no aparecían en ningún lado porque la fila ni se creaba. */}
      <PendingNotes
        scope="mine"
        canClose
        hrefFor={(id) => `/doctor/consultation/${id}`}
      />

      {/* Acceso rápido al calendario */}
      <div className="text-[12px] text-text-muted">
        <Link href="/doctor/calendar" className="text-violet-text hover:underline font-semibold">
          {t('goToCalendar')} →
        </Link>
      </div>
    </div>
  );
}
