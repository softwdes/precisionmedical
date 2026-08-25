'use client';
import { localeApp } from '@/lib/fechas';

/**
 * B.14 — Admisión del día · Cola de check-in
 *
 * Recepción ve todas las citas del día agrupadas por estado.
 * Un clic rápido hace check-in inline; también pueden ir al detalle (B.15).
 *
 * Color de identidad: emerald (Regla #5)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CalendarDays, CheckCircle2, Clock, ChevronRight,
  RefreshCw, UserCheck, AlertTriangle,
  Stethoscope, Building2, ChevronLeft, Tv2, Search, X,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { OnlineBadge } from '@/components/visit/online-visit';
import { StatusPill }   from '@/components/ui-phoenix/status-pill';
import { PendingNotes } from '@/components/visit/pending-notes';
import { useLiveSync } from '@/lib/use-live-sync';
import { LiveStatus } from '@/components/ui-phoenix/live-status';
import { EmptyState }   from '@/components/ui-phoenix/empty-state';
import { DatePicker }   from '@/components/ui-phoenix/date-picker';

// ─── Types ────────────────────────────────────────────────────────────────────
/**
 * Texto comparable: sin mayúsculas y sin acentos.
 *
 * `NFD` separa la letra de su tilde y el rango de marcas las borra, así "josé"
 * y "jose" son lo mismo. En una clínica donde la mitad de los nombres llevan
 * acento, buscar "jose" y no encontrar a José es una búsqueda que no sirve.
 */
function normalizar(s: string): string {
  // Propiedad Unicode y no un rango de caracteres: el rango son marcas invisibles
  // en el fuente y cualquier herramienta que toque el archivo las rompe.
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

interface AdmissionAppt {
  id:              string;
  scheduledFor:    string;
  durationMinutes: number;
  type:            string;
  status:          string;
  checkedInAt:     string | null;
  /** El doctor terminó con el paciente — la cita ya se puede cobrar y cerrar. */
  doctorDoneAt:    string | null;
  /** Telemedicina — la cola tiene que decirlo antes de ir a buscar al paciente. */
  isOnline:        boolean;
  meetingUrl:      string | null;
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
  return new Date(iso).toLocaleTimeString(localeApp(), {
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
    emerald: 'text-emerald bg-emerald/[0.07]',
    amber:   'text-amber   bg-amber/[0.07]',
    cyan:    'text-cyan    bg-cyan/[0.07]',
    violet:  'text-violet-text  bg-violet/[0.07] border border-border',
  };
  return (
    <div className={`rounded-lg p-4 ${colors[tone]}`}>
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
  /** El doctor terminó y la cita sigue abierta: hay que cobrar y cerrar. */
  const isReadyForCheckout = !isDone && !!appt.doctorDoneAt;

  const borderClass = isReadyForCheckout
    ? 'border border-emerald/50 bg-emerald/[0.05] ring-1 ring-emerald/20'
    : isCheckedIn
    ? 'border border-amber/50 bg-amber/[0.04] ring-1 ring-amber/20'
    : isInRoom
      ? 'border border-border bg-violet/[0.05]'
      : appt.case?.hasPending
        ? 'border border-amber/30 bg-amber/[0.02]'
        : 'border border-border bg-bg-2/20';

  return (
    <div className={`rounded-lg p-4 transition-all ${borderClass}`}>
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
            {/* Antes que los estados: si la visita es por video, el asistente NO
                sale a buscar al paciente a la sala de espera. Cambia lo que hace
                con la fila, así que se ve sin leer nada más. */}
            {appt.isOnline && <OnlineBadge compact />}
            {/* Status badge — "listo para cobrar" va PRIMERO: es el estado que
                le dice al asistente que tiene algo que hacer con esta fila. */}
            {isReadyForCheckout ? (
              <StatusPill label={t('statusDoctorDone')} state="success" />
            ) : isInRoom && (
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet/10 border border-violet/40 text-violet-text text-xs font-semibold hover:bg-violet/20 transition-colors"
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
  const [loading,      setLoading]      = useState(true);
  const [checkingIn,   setCheckingIn]   = useState<string | null>(null);
  const [clinicFilter, setClinicFilter] = useState<string>('all');
  /** Búsqueda de paciente dentro de la lista del día. */
  const [patientQuery, setPatientQuery] = useState('');
  const [allClinics,   setAllClinics]   = useState<{ id: string; name: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    // YYYY-MM-DD in local timezone
    return now.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD
  });

  // `silent` para el refresco automático: sin esto cada poll prendía el skeleton
  // y la cola parpadeaba cada 20 s en la cara de recepción.
  const load = useCallback(async (date?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = date ?? selectedDate;
      const res  = await fetch(`/api/admin/admission?date=${d}`);
      const data = await res.json();
      if (data.ok) {
        setPending(data.pending);
        setActive(data.active);
        setDone(data.done);
        setTotals(data.totals);
        setDisplayDate(data.displayDate);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(selectedDate); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronización en vivo por PULSO (ver lib/use-live-sync).
  //
  // Antes traía el payload completo de la cola cada 20 s. Ahora consulta una huella
  // de ~60 bytes cada 5 s y solo recarga cuando algo cambió de verdad: baja la
  // latencia a un tercio Y el tráfico en reposo a casi nada. Esta pantalla queda
  // abierta toda la jornada en recepción.
  const isToday = selectedDate === new Date().toLocaleDateString('en-CA');
  const { lastSyncedAt, failing, syncNow } = useLiveSync({
    url: `/api/admin/pulse?date=${selectedDate}`,
    // Silencioso: el skeleton en un refresco de fondo hacía parpadear la lista.
    onChange: () => { void load(selectedDate, true); },
    enabled: isToday,
  });

  function shiftDate(days: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  }

  useEffect(() => {
    fetch('/api/admin/clinics')
      .then(r => r.json())
      .then(d => setAllClinics(d.clinics ?? []));
  }, []);

  async function handleCheckIn(apptId: string) {
    setCheckingIn(apptId);
    try {
      await fetch(`/api/admin/admission/${apptId}/check-in`, { method: 'POST' });
      await load();
    } finally {
      setCheckingIn(null);
    }
  }

  const allAppts = [...pending, ...active, ...done];

  /**
   * Filtro por clínica + por paciente.
   *
   * El de paciente busca **dentro de la lista del día**, en el cliente: la data ya
   * está en memoria, así que filtra en la misma tecla y no hay consulta, ni
   * debounce, ni el riesgo de que la caché deje el listado congelado mientras se
   * escribe (lo que nos pasó con las listas de `apps/web`).
   *
   * Busca en nombre, apellido, **código de caso** —que es lo que el mostrador
   * canta: "el GM-3175"— y teléfono. El teléfono se compara solo por dígitos, así
   * que `8017878778` encuentra a `(801) 787-8778`.
   */
  const filterAppts = <T extends AdmissionAppt>(list: T[]) => {
    const porClinica = clinicFilter === 'all' ? list : list.filter(a => a.clinic.id === clinicFilter);
    const q = normalizar(patientQuery);
    if (!q) return porClinica;
    const digitos = patientQuery.replace(/\D/g, '');
    return porClinica.filter((a) => {
      const nombre = normalizar(`${a.patient.firstName} ${a.patient.lastName}`);
      const alReves = normalizar(`${a.patient.lastName} ${a.patient.firstName}`);
      const codigo = normalizar(a.case?.caseCode ?? '');
      const tel = (a.patient.phone ?? '').replace(/\D/g, '');
      return nombre.includes(q)
        || alReves.includes(q)
        || codigo.includes(q)
        || (digitos.length >= 3 && tel.includes(digitos));
    });
  };

  const awaitingAdmission = active.filter(a => a.status === 'CHECKED_IN');
  const inRoom            = active.filter(a => a.status === 'IN_PROGRESS');

  const filteredPending  = filterAppts(pending);
  const filteredAwaiting = filterAppts(awaitingAdmission);
  const filteredInRoom   = filterAppts(inRoom);
  const filteredDone     = filterAppts(done);

  const visibleCount =
    filteredPending.length + filteredAwaiting.length + filteredInRoom.length + filteredDone.length;
  /** Se buscó y no hay nada: hay que decirlo, no dejar la pantalla vacía. */
  const sinResultados = patientQuery.trim() !== '' && visibleCount === 0;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={t('pageTitle')}
        subtitle={displayDate || t('pageSubtitle')}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Frescura: dice hace cuánto se sabe que esto está al día, y avisa en
                ámbar si dejó de sincronizar. Es lo que evita el peor escenario —
                una pantalla congelada con cara de viva. Solo con el día de hoy:
                en días pasados no hay nada que sincronizar. */}
            {isToday && (
              <LiveStatus lastSyncedAt={lastSyncedAt} failing={failing} onRetry={syncNow} />
            )}
            {/* Date navigator */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-bg-2/40 h-9 px-1">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <DatePicker
                value={selectedDate}
                onChange={(k) => setSelectedDate(k)}
                accent="emerald"
                todayLabel={t('today')}
                className="[&>button]:border-0 [&>button]:bg-transparent [&>button]:h-7 [&>button]:text-sm [&>button]:font-semibold"
              />
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}
                className="h-9 px-3 rounded-md border border-emerald/40 text-emerald text-xs font-semibold hover:bg-emerald/10 transition-colors"
              >
                {t('today')}
              </button>
            )}
            <button
              type="button"
              onClick={() => load(selectedDate)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-emerald/40 hover:text-emerald transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {/* Lobby TV */}
            <a
              href={`${process.env.NEXT_PUBLIC_FORMS_URL ?? 'http://localhost:3001'}/lobby${clinicFilter !== 'all' ? `/${clinicFilter}` : ''}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-muted text-xs hover:border-cyan/40 hover:text-cyan transition-all whitespace-nowrap"
              title="Abrir sala de espera en TV"
            >
              <Tv2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('lobbyTv')}</span>
            </a>
          </div>
        }
      />

      {/* Buscar paciente — antes de los chips de clínica: es el filtro que se usa
          con el paciente delante ("¿estoy en la lista?"), la clínica se elige una
          vez al empezar el turno. */}
      <div className="px-4 sm:px-6 pt-1 pb-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={patientQuery}
            onChange={(e) => setPatientQuery(e.target.value)}
            placeholder={t('searchPatientPlaceholder')}
            aria-label={t('searchPatientPlaceholder')}
            className="w-full h-8 pl-8 pr-8 rounded-md bg-bg-2 border border-border text-[12.5px] text-text-1 placeholder:text-text-muted outline-none focus:border-emerald/50 focus:ring-1 focus:ring-emerald/20 transition-all"
          />
          {patientQuery && (
            <button
              type="button"
              onClick={() => setPatientQuery('')}
              aria-label={t('searchClear')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Cuántas filas quedan de cuántas: los KPI de arriba siguen contando el
            día completo a propósito (son la realidad del día, no de la vista), así
            que sin esto una lista de 1 fila bajo un "5 citas" se lee como un bug. */}
        {patientQuery.trim() !== '' && (
          <span className="text-[11px] text-text-muted tabular-nums">
            {t('searchShowing', { shown: visibleCount, total: allAppts.length })}
          </span>
        )}
      </div>

      {/* Filtro de clínica */}
      {allClinics.length > 0 && (
        <div className="px-4 sm:px-6 pt-1 pb-2 flex items-center gap-2 flex-wrap">
          <Building2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <button
            onClick={() => setClinicFilter('all')}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              clinicFilter === 'all'
                ? 'bg-emerald text-white'
                : 'bg-bg-2 text-text-muted hover:text-text-1 border border-border'
            }`}
          >
            Todas ({allAppts.length})
          </button>
          {allClinics.map(c => {
            const count = allAppts.filter(a => a.clinic.id === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                onClick={() => setClinicFilter(c.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  clinicFilter === c.id
                    ? 'bg-emerald text-white'
                    : 'bg-bg-2 text-text-muted hover:text-text-1 border border-border'
                }`}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="px-4 sm:px-6 pb-8 space-y-5">
        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={isToday ? t('kpiAppointmentsToday') : 'Citas del día'} value={totals.total}     tone="cyan"    icon={CalendarDays} />
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
        ) : sinResultados ? (
          /* Buscó y no hay nadie con ese nombre en el día. El paciente puede
             existir y tener la cita otro día, así que se ofrece la salida en vez
             de dejar la pantalla en blanco. */
          <EmptyState.Rich
            icon={Search}
            title={t('searchNoMatchTitle', { q: patientQuery.trim() })}
            subtitle={t('searchNoMatchSubtitle')}
            action={
              <a
                href={`/patients?q=${encodeURIComponent(patientQuery.trim())}`}
                className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors inline-flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                {t('searchAllPatients')}
              </a>
            }
          />
        ) : (
          <>
            {/* ── 1. Esperando admisión (CHECKED_IN) — ARRIBA, acción urgente ── */}
            {filteredAwaiting.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber" />
                  </span>
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-amber">
                    {t('sectionAwaitingAdmission', { count: filteredAwaiting.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {filteredAwaiting.map(a => (
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
            {filteredPending.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {t('sectionUpcoming', { count: filteredPending.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {filteredPending.map(a => (
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
            {filteredInRoom.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope className="w-4 h-4 text-violet-text" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-violet-text">
                    {t('sectionInRoom', { count: filteredInRoom.length })}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {filteredInRoom.map(a => (
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
            {filteredDone.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-text-muted" />
                  <h2 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {t('sectionCompleted', { count: filteredDone.length })}
                  </h2>
                </div>
                <div className="space-y-2 opacity-60">
                  {filteredDone.map(a => (
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

            {/* Notas sin cerrar — abajo de la cola, de toda la clínica.
                El asistente no firma (eso es del médico), pero es quien persigue:
                cada fila lleva el recordatorio URGENTE por mensajería interna con
                el paciente y la fecha. */}
            <PendingNotes
              scope="clinic"
              hrefFor={(id) => `/admission/${id}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
