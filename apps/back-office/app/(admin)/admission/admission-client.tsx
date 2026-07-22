'use client';

/**
 * B.14 — Admisión del día · Cola de check-in
 *
 * Recepción ve todas las citas del día agrupadas por estado.
 * Un clic rápido hace check-in inline; también pueden ir al detalle (B.15).
 *
 * Color de identidad: emerald (Regla #5)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CalendarDays, CheckCircle2, Clock, ChevronRight,
  RefreshCw, Search, UserCheck, AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill }   from '@/components/ui-phoenix/status-pill';
import { EmptyState }   from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdmissionAppt {
  id:              string;
  scheduledFor:    string;
  durationMinutes: number;
  type:            string;
  status:          string;
  checkedInAt:     string | null;
  notes:           string | null;
  patient: { id: string; firstName: string; lastName: string; phone: string | null };
  provider: { id: string; firstName: string; lastName: string; specialty: string } | null;
  clinic:   { id: string; name: string };
  case: {
    id: string; caseCode: string; caseType: string;
    pipVerifiedAt: string | null; intakeFormCompletedAt: string | null;
    isReady: boolean; hasPending: boolean;
    primaryInsurance: { id: string; name: string; shortCode: string; color: string } | null;
  } | null;
}

interface Totals {
  total: number; checkedIn: number; pending: number; inRoom: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, tone, icon: Icon,
}: {
  label: string; value: number;
  tone: 'emerald' | 'amber' | 'cyan' | 'violet';
  icon: React.ElementType;
}) {
  const colors = {
    emerald: 'text-emerald border-emerald/30 bg-emerald/5',
    amber:   'text-amber   border-amber/30   bg-amber/5',
    cyan:    'text-cyan    border-cyan/30    bg-cyan/5',
    violet:  'text-violet  border-violet/30  bg-violet/5',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</span>
      </div>
      <div className="text-3xl font-black">{value}</div>
    </div>
  );
}

// ─── ApptCard ─────────────────────────────────────────────────────────────────
function ApptCard({
  appt, onCheckIn, checkingIn,
}: {
  appt: AdmissionAppt;
  onCheckIn: (id: string) => void;
  checkingIn: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('phoenix.admission');
  const TYPE_LABELS: Record<string, string> = {
    AUTO_ACCIDENT:   t('typeAutoAccident'),
    FAMILY_PRACTICE: t('typeFamilyPractice'),
    URGENT_CARE:     t('typeUrgentCare'),
    FOLLOW_UP:       t('typeFollowUp'),
    CONSULTATION:    t('typeConsultation'),
  };
  const isDone      = appt.status === 'COMPLETED' || appt.status === 'NO_SHOW';
  const isCheckedIn = appt.status === 'CHECKED_IN';
  const isInRoom    = appt.status === 'IN_PROGRESS';
  const isPending   = !isDone && !isCheckedIn && !isInRoom;

  const borderClass = isCheckedIn
    ? 'border-amber/50 bg-amber/[0.04] ring-1 ring-amber/20'
    : isInRoom
      ? 'border-violet/30 bg-violet/[0.03]'
      : appt.case?.hasPending
        ? 'border-amber/30 bg-amber/[0.02]'
        : 'border-border bg-bg-1';

  return (
    <div className={`rounded-lg border p-4 transition-all ${borderClass}`}>
      <div className="flex items-start gap-3">
        <PersonAvatar
          firstName={appt.patient.firstName}
          lastName={appt.patient.lastName}
          size={9}
        />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-bold text-text-1 text-sm">
              {appt.patient.firstName} {appt.patient.lastName}
            </span>
            {appt.case && (
              <span className="font-mono text-[11px] text-emerald font-bold">
                {appt.case.caseCode}
              </span>
            )}
            {/* Status badge */}
            {isInRoom && (
              <StatusPill label={t('statusInRoom')} state="info" />
            )}
            {isCheckedIn && (
              <StatusPill label={t('statusCheckedIn')} state="success" />
            )}
            {appt.status === 'COMPLETED' && (
              <StatusPill label={t('statusCompleted')} state="success" />
            )}
            {appt.status === 'NO_SHOW' && (
              <StatusPill label={t('statusNoShow')} state="danger" />
            )}
            {appt.case?.hasPending && isPending && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border border-amber/30 bg-amber/10 text-amber">
                <AlertTriangle className="w-2.5 h-2.5" />
                {t('verificationPending')}
              </span>
            )}
            {appt.case?.isReady && isPending && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border border-emerald/30 bg-emerald/10 text-emerald">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {t('documentsOk')}
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {fmtTime(appt.scheduledFor)} · {appt.durationMinutes} min
            </span>
            {appt.provider && (
              <span className="flex items-center gap-1">
                <Stethoscope className="w-3 h-3" />
                Dr. {appt.provider.lastName}
              </span>
            )}
            <span>{TYPE_LABELS[appt.type] ?? appt.type}</span>
            {appt.case?.primaryInsurance && (
              <span className="flex items-center gap-1">
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-black text-white"
                  style={{ backgroundColor: appt.case.primaryInsurance.color }}
                >
                  {appt.case.primaryInsurance.shortCode}
                </span>
                {appt.case.primaryInsurance.name}
              </span>
            )}
          </div>

          {/* Checked-in time */}
          {appt.checkedInAt && (
            <div className="mt-1 text-[10px] text-emerald">
              {t('checkedInAt', { time: fmtTime(appt.checkedInAt) })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {isPending && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onCheckIn(appt.id)}
                disabled={checkingIn}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald text-white text-xs font-semibold hover:bg-emerald/90 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3 h-3" />
                {t('checkIn')}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/admission/${appt.id}`)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-emerald/40 text-emerald text-xs hover:bg-emerald/10 transition-colors"
                title={t('viewFullAdmission')}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {isCheckedIn && (
            <button
              type="button"
              onClick={() => router.push(`/admission/${appt.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber text-white text-xs font-semibold hover:bg-amber/90 transition-colors shadow-sm"
            >
              <UserCheck className="w-3 h-3" />
              {t('admit')}
            </button>
          )}
          {isInRoom && (
            <button
              type="button"
              onClick={() => router.push(`/admission/${appt.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet/10 border border-violet/40 text-violet text-xs font-semibold hover:bg-violet/20 transition-colors"
            >
              {t('withDoctor')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmissionClient() {
  const router = useRouter();
  const t = useTranslations('phoenix.admission');
  const [pending,     setPending]     = useState<AdmissionAppt[]>([]);
  const [active,      setActive]      = useState<AdmissionAppt[]>([]);
  const [done,        setDone]        = useState<AdmissionAppt[]>([]);
  const [totals,      setTotals]      = useState<Totals>({ total: 0, checkedIn: 0, pending: 0, inRoom: 0 });
  const [displayDate, setDisplayDate] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [checkingIn,  setCheckingIn]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/admission');
      const data = await res.json();
      if (data.ok) {
        setPending(data.pending);
        setActive(data.active);
        setDone(data.done);
        setTotals(data.totals);
        setDisplayDate(data.displayDate);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCheckIn(apptId: string) {
    setCheckingIn(apptId);
    try {
      await fetch(`/api/admin/admission/${apptId}/check-in`, { method: 'POST' });
      await load();
    } finally {
      setCheckingIn(null);
    }
  }

  // Derivados de `active`: separar los que esperan admisión (CHECKED_IN)
  // de los que ya pasaron a sala (IN_PROGRESS) para priorizar el orden visual.
  const awaitingAdmission = active.filter(a => a.status === 'CHECKED_IN');
  const inRoom            = active.filter(a => a.status === 'IN_PROGRESS');

  return (
    <div className="flex flex-col">
      <PageHeader
        title={t('pageTitle')}
        subtitle={displayDate || t('pageSubtitle')}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/front-office')}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-emerald/40 hover:text-emerald transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('searchPatient')}</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/calendar')}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-emerald/40 hover:text-emerald transition-all"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('viewAgenda')}</span>
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-emerald/40 hover:text-emerald transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      <div className="px-4 sm:px-6 pb-8 space-y-5">
        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={t('kpiAppointmentsToday')} value={totals.total}     tone="cyan"    icon={CalendarDays} />
          <KpiCard label={t('kpiCheckedIn')}          value={totals.checkedIn} tone="emerald" icon={CheckCircle2} />
          <KpiCard label={t('kpiInRoom')}              value={totals.inRoom}    tone="violet"  icon={Stethoscope} />
          <KpiCard label={t('kpiPending')}             value={totals.pending}   tone="amber"   icon={Clock} />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-bg-2/40 animate-pulse" />
            ))}
          </div>
        ) : totals.total === 0 ? (
          <EmptyState.Rich
            icon={CalendarDays}
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
          />
        ) : (
          <>
            {/* ── 1. Esperando admisión (CHECKED_IN) — ARRIBA, acción urgente ── */}
            {awaitingAdmission.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber" />
                  </span>
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-amber">
                    {t('sectionAwaitingAdmission', { count: awaitingAdmission.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {awaitingAdmission.map(a => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onCheckIn={handleCheckIn}
                      checkingIn={checkingIn === a.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── 2. Próximos en llegar (SCHEDULED / CONFIRMED) ── */}
            {pending.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {t('sectionUpcoming', { count: pending.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {pending.map(a => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onCheckIn={handleCheckIn}
                      checkingIn={checkingIn === a.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── 3. En sala con el doctor (IN_PROGRESS) ── */}
            {inRoom.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope className="w-4 h-4 text-violet" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-violet">
                    {t('sectionInRoom', { count: inRoom.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {inRoom.map(a => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onCheckIn={handleCheckIn}
                      checkingIn={checkingIn === a.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── 4. Completados — fondo, opacidad reducida ── */}
            {done.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-text-muted" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {t('sectionCompleted', { count: done.length })}
                  </h2>
                </div>
                <div className="space-y-2 opacity-60">
                  {done.map(a => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onCheckIn={handleCheckIn}
                      checkingIn={checkingIn === a.id}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
