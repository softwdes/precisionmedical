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
  CalendarCheck2, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Hourglass, Sun, Video, FileSignature, ExternalLink,
} from 'lucide-react';
import { PageHeader, KpiCard, EmptyState, TagPill, PersonAvatar } from '@/components/ui-phoenix';

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
  dateLabel: string;
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

export function MyDayClient({ doctorName, appointments, unsignedNotes, clinicalUrl, dateKey, dateLabel, isToday, prevDate, nextDate }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...appointments].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const completed = sorted.filter(a => a.status === 'COMPLETED');
  const active = sorted.filter(a => ACTIVE.includes(a.status));
  const waiting = active.filter(a => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS');

  // Hero solo aplica al día de HOY: en consulta > en espera con triaje > en espera > próxima futura.
  // En días pasados/futuros se muestra la lista completa sin hero ni CTA.
  const hero = isToday
    ? (active.find(a => a.status === 'IN_PROGRESS')
      ?? active.find(a => a.status === 'CHECKED_IN' && a.hasTriage)
      ?? active.find(a => a.status === 'CHECKED_IN')
      ?? active.find(a => new Date(a.scheduledFor).getTime() >= now - 15 * 60_000)
      ?? active[0]
      ?? null)
    : null;

  const queue = active.filter(a => a.id !== hero?.id);
  const minsTo = hero ? Math.round((new Date(hero.scheduledFor).getTime() - now) / 60_000) : 0;
  const heroReady = !!hero && hero.hasTriage && !!hero.attendanceSignedAt;
  const noteHref = (apptId: string): string | null =>
    clinicalUrl ? `${clinicalUrl}/visit/${apptId}` : null;

  const statusPill = (a: MyDayAppointment): React.ReactElement => {
    if (a.status === 'IN_PROGRESS') return <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet border-violet/30" />;
    if (a.status === 'CHECKED_IN') {
      return a.hasTriage
        ? <TagPill label={t('triageDone')} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
        : <TagPill label={t('statusWaiting')} colorClass="bg-amber/15 text-amber border-amber/30" />;
    }
    return <TagPill label={t('statusPending')} colorClass="bg-amber/15 text-amber border-amber/30" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={t('greeting', { name: doctorName })}
          subtitle={`${dateLabel} · ${t('myDaySubtitle', { count: active.length + completed.length })}`}
        />
        {/* Navegación de día — igual que Day Admission */}
        <div className="flex items-center gap-1 flex-wrap">
          <Link
            href={`/doctor?date=${prevDate}`}
            aria-label={t('dayPrev')}
            className="w-7 h-7 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => { if (e.target.value) router.push(`/doctor?date=${e.target.value}`); }}
            aria-label={t('dayPick')}
            className="h-7 rounded border border-border bg-bg-1 px-2 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-violet [color-scheme:dark]"
          />
          <Link
            href={`/doctor?date=${nextDate}`}
            aria-label={t('dayNext')}
            className="w-7 h-7 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          {!isToday && (
            <Link
              href="/doctor"
              className="ml-1 px-2.5 h-7 rounded text-[12px] font-semibold text-white flex items-center transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
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
                <span>{hero.hasTriage ? t('triageDone') : t('triagePendingShort')}</span>
                <span>·</span>
                <span>{hero.attendanceSignedAt ? t('attendanceSigned') : t('attendancePending')}</span>
                <span>·</span>
                <span>{hero.clinicName}</span>
              </div>
            </div>
          </div>
          {heroReady && noteHref(hero.id) ? (
            <a
              href={noteHref(hero.id)!}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold w-full sm:w-auto"
              style={{ background: 'linear-gradient(135deg, #10B981, #14b8a6)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
            >
              {t('attendNow')} →
            </a>
          ) : (
            <div className="shrink-0 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2.5 text-[11px] text-amber max-w-[220px]">
              {!hero.hasTriage ? t('guardrailTriage') : !hero.attendanceSignedAt ? t('guardrailAttendance') : t('guardrailNoClinical')}
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
