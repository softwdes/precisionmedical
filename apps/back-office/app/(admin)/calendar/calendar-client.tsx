'use client';

/**
 * B.10 — CalendarClient · Grid semanal de citas
 *
 * Color-coding del mockup aprobado (Regla #5):
 *  AUTO_ACCIDENT seguimiento → rose   (#f43f5e)
 *  AUTO_ACCIDENT 1ra cita    → rose→pink gradient + glow
 *  FAMILY_PRACTICE seguimiento → emerald (#10b981)
 *  FAMILY_PRACTICE 1ra cita  → emerald→teal gradient + glow
 *  PENDING / SCHEDULED sin confirmar → amber (#f59e0b)
 *  COMPLETED / atendida      → brand/indigo opacity 0.7
 *
 * Accent del módulo: cyan (Regla #5 tabla)
 */

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';

type CalendarView = 'day' | 'week' | 'month';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clinic    { id: string; name: string }
interface Provider  { id: string; firstName: string; lastName: string; specialty: string | null }

interface CalendarAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  visitNumber: number; // 0 = primera cita
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: string | null;
  };
  case: {
    id: string;
    caseCode: string;
    accidentType: string | null;
    accidentDate: string | null;
    status: string;
    intakeFormCompletedAt: string | null;
    attorney: { id: string; firmName: string | null; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
    primaryInsurance: { id: string; name: string } | null;
  } | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

interface CalendarClientProps {
  clinics: Clinic[];
  providers: Provider[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const WEEKDAYS_ES     = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const WEEKDAYS_ALL_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS_ES       = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const TIME_SLOTS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
                    '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getFirstDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Devuelve un array de semanas (7 días c/u) que cubren el mes completo. */
function getMonthGrid(monthRef: Date): Date[][] {
  const firstDay  = getFirstDayOfMonth(monthRef);
  const gridStart = getMondayOf(firstDay);
  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Terminamos cuando salimos del mes y tenemos al menos 4 semanas
    if (cursor.getMonth() !== monthRef.getMonth() && weeks.length >= 4) break;
  }
  return weeks;
}

// ─── Timezone helpers (Mountain Time / America/Denver) ────────────────────────
// Toda la clínica opera en Utah (MDT = UTC−6 / MST = UTC−7).
// Usamos 'America/Denver' para que el calendario sea correcto sin importar
// la timezone del browser del usuario.

function denverDateStr(d: Date): string {
  // Returns 'YYYY-MM-DD' in America/Denver timezone
  // Usar SOLO para bucketing de appointments (tienen UTC absoluto)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function localDateStr(d: Date): string {
  // Returns 'YYYY-MM-DD' usando la fecha LOCAL del objeto Date.
  // Usar para las CLAVES del grid (días/columnas) porque weekStart
  // se construye con setHours(0,0,0,0) en la timezone local del browser.
  // Si el browser está en CDT (UTC-5), medianoche CDT ≠ medianoche MDT,
  // y denverDateStr daría el día anterior. localDateStr evita ese mismatch.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slotOf(isoString: string): string {
  const d = new Date(isoString);
  const t = d.toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour12:   false,
    hour:     '2-digit',
    minute:   '2-digit',
  });
  // t is "09:30" or "14:00"
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`;
}

// ─── Color por tipo + primera cita ───────────────────────────────────────────
function getEventStyle(appt: CalendarAppointment): {
  bg: string; border: string; text: string; glow?: string; badge?: string;
} {
  const isFirst = appt.visitNumber === 0;
  const isCompleted = appt.status === 'COMPLETED';
  const isPending = appt.status === 'PENDING' || appt.status === 'SCHEDULED';

  if (isCompleted) {
    return {
      bg: 'rgba(99,102,241,0.18)',
      border: 'rgba(99,102,241,0.35)',
      text: '#a5b4fc',
    };
  }
  if (isPending) {
    return {
      bg: 'rgba(245,158,11,0.15)',
      border: 'rgba(245,158,11,0.40)',
      text: '#fbbf24',
    };
  }

  const isMVA = appt.type === 'AUTO_ACCIDENT' || appt.case?.accidentType === 'AUTO';
  const isGM  = appt.type === 'FAMILY_PRACTICE' || appt.type === 'URGENT_CARE';

  if (isMVA && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(244,63,94,0.28),rgba(236,72,153,0.18))',
      border: 'rgba(236,72,153,0.55)',
      text: '#fda4af',
      glow: '0 0 10px rgba(244,63,94,0.35)',
      badge: '🆕',
    };
  }
  if (isMVA) {
    return { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.40)', text: '#fca5a5' };
  }
  if (isGM && isFirst) {
    return {
      bg: 'linear-gradient(135deg,rgba(16,185,129,0.28),rgba(20,184,166,0.18))',
      border: 'rgba(16,185,129,0.55)',
      text: '#6ee7b7',
      glow: '0 0 10px rgba(16,185,129,0.30)',
      badge: '🆕',
    };
  }
  if (isGM) {
    return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.40)', text: '#6ee7b7' };
  }
  // Other
  return { bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.35)', text: '#67e8f9' };
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  emoji,
  placeholder,
  value,
  options,
  onChange,
}: {
  emoji: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const label = current?.label ?? placeholder;
  const isActive = !!value;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 pl-2.5 pr-1.5 h-7 rounded text-[11px] font-medium border transition-all ${
          isActive
            ? 'border-cyan bg-cyan/15 text-cyan'
            : 'border-border/60 bg-white/[0.04] text-text-2 hover:border-border hover:text-text-1'
        }`}
      >
        <span className="leading-none">{emoji}</span>
        <span className="max-w-[100px] truncate">{label}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          {/* Dropdown panel */}
          <div className="absolute top-[calc(100%+4px)] left-0 z-30 min-w-[180px] rounded-lg border border-border bg-bg-1 shadow-2xl py-1 overflow-hidden">
            {/* "All" option */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={`w-full text-left flex items-center px-3 py-1.5 text-[12px] transition-colors hover:bg-white/5 ${
                !value ? 'text-cyan font-semibold' : 'text-text-2'
              }`}
            >
              {placeholder}
              {!value && <span className="ml-auto text-[10px]">✓</span>}
            </button>
            <div className="h-px bg-border/40 mx-2 my-0.5" />
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left flex items-center px-3 py-1.5 text-[12px] transition-colors hover:bg-white/5 ${
                  value === o.value ? 'text-cyan font-semibold' : 'text-text-2'
                }`}
              >
                {o.label}
                {value === o.value && <span className="ml-auto text-[10px]">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── LegendStats (shared entre las 3 vistas) ─────────────────────────────────

function LegendStats({
  appointments, firstVisitCount, pendingConfirm,
}: {
  appointments: CalendarAppointment[];
  firstVisitCount: number;
  pendingConfirm: number;
}) {
  return (
    <div className="mt-3 flex items-center justify-between flex-wrap gap-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {([
          { color: 'rgba(244,63,94,0.75)',                              label: 'MVA · seguimiento' },
          { color: 'linear-gradient(135deg,#f43f5e,#ec4899)',           label: '🆕 MVA · 1ra cita', glow: true },
          { color: 'rgba(16,185,129,0.75)',                             label: 'GP · seguimiento' },
          { color: 'linear-gradient(135deg,#10b981,#14b8a6)',           label: '🆕 GP · 1ra cita', glow: true },
          { color: 'rgba(245,158,11,0.75)',                             label: 'Sin confirmar' },
          { color: 'rgba(99,102,241,0.50)',                             label: 'Atendida ✓' },
        ] as { color: string; label: string; glow?: boolean }[]).map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-1.5 rounded-sm shrink-0"
              style={{ background: item.color, boxShadow: item.glow ? '0 0 4px rgba(244,63,94,0.40)' : undefined }} />
            <span className="text-[10px] text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted shrink-0">
        <span><span className="text-text-2 font-semibold">{appointments.length}</span> citas</span>
        {firstVisitCount > 0 && <span className="text-rose font-semibold">{firstVisitCount} primeras 🆕</span>}
        {pendingConfirm  > 0 && <span className="text-amber">{pendingConfirm} sin confirmar</span>}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CalendarClient({ clinics, providers }: CalendarClientProps) {
  const [weekStart, setWeekStart]       = useState<Date>(() => getMondayOf(new Date()));
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);

  // Filters
  const [filterClinic,   setFilterClinic]   = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [calView, setCalView] = useState<CalendarView>('week');

  // ─── Data loading — AbortController pattern ──────────────────────────────
  // Cada vez que cambia weekStart, calView o filtros, el efecto se re-ejecuta.
  // El cleanup cancela la petición anterior a nivel de red (AbortController),
  // imposibilitando que una respuesta stale sobreescriba datos frescos.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    let from: Date;
    let to:   Date;

    if (calView === 'day') {
      from = new Date(weekStart); from.setHours(0, 0, 0, 0);
      to   = new Date(weekStart); to.setHours(23, 59, 59, 999);
    } else if (calView === 'week') {
      from = new Date(weekStart);
      to   = addDays(weekStart, 4); to.setHours(23, 59, 59, 999);
    } else {
      const grid = getMonthGrid(weekStart);
      from = new Date(grid[0][0]); from.setHours(0, 0, 0, 0);
      const lastWeek = grid[grid.length - 1];
      to = new Date(lastWeek[lastWeek.length - 1]); to.setHours(23, 59, 59, 999);
    }

    const params = new URLSearchParams({
      from: from.toISOString(),
      to:   to.toISOString(),
      ...(filterClinic   ? { clinicId:   filterClinic }   : {}),
      ...(filterProvider ? { providerId: filterProvider } : {}),
      ...(filterType     ? { type:       filterType }     : {}),
    });

    fetch(`/api/admin/appointments?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setAppointments(data.appointments ?? []);
        setLoading(false);
      })
      .catch(err => {
        // AbortError es cancelación intencional — no es un error real
        if ((err as Error).name !== 'AbortError') setLoading(false);
      });

    // Cleanup: cancela la petición en vuelo si el efecto se re-dispara
    return () => controller.abort();
  }, [weekStart, calView, filterClinic, filterProvider, filterType, refreshKey]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const goToPrev = () => {
    if (calView === 'day')        setWeekStart(w => addDays(w, -1));
    else if (calView === 'week')  setWeekStart(w => addDays(w, -7));
    else setWeekStart(w => getFirstDayOfMonth(new Date(w.getFullYear(), w.getMonth() - 1, 1)));
  };
  const goToNext = () => {
    if (calView === 'day')        setWeekStart(w => addDays(w, 1));
    else if (calView === 'week')  setWeekStart(w => addDays(w, 7));
    else setWeekStart(w => getFirstDayOfMonth(new Date(w.getFullYear(), w.getMonth() + 1, 1)));
  };
  const goToToday = () => {
    const now = new Date();
    if (calView === 'day')        setWeekStart(now);
    else if (calView === 'week')  setWeekStart(getMondayOf(now));
    else                          setWeekStart(getFirstDayOfMonth(now));
  };
  /** Cambia de vista ajustando weekStart al ancla correcta para esa vista. */
  const switchView = (v: CalendarView) => {
    setCalView(v);
    if (v === 'week')       setWeekStart(w => getMondayOf(w));
    else if (v === 'month') setWeekStart(w => getFirstDayOfMonth(w));
    // day: mantiene el weekStart actual como "día seleccionado"
  };

  // ─── Derived state ───────────────────────────────────────────────────────────
  // 5-day header array (week view)
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  // O(1) lookup: Denver-date → slot → appointments[]
  type ApptMap = Record<string, Record<string, CalendarAppointment[]>>;
  const apptMap: ApptMap = {};
  for (const appt of appointments) {
    const day  = denverDateStr(new Date(appt.scheduledFor));
    const slot = slotOf(appt.scheduledFor);
    if (!apptMap[day]) apptMap[day] = {};
    if (!apptMap[day][slot]) apptMap[day][slot] = [];
    apptMap[day][slot].push(appt);
  }

  const firstVisitCount = appointments.filter(a => a.visitNumber === 0).length;
  const pendingConfirm  = appointments.filter(a => a.status === 'SCHEDULED').length;

  // Labels en barra de título
  const viewEnd4   = addDays(weekStart, 4);
  const monthLabel =
    calView === 'day'
      ? `${weekStart.getDate()} ${MONTHS_ES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
      : `${MONTHS_ES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
  const weekLabel =
    calView === 'day'
      ? `${WEEKDAYS_ALL_ES[(weekStart.getDay() + 6) % 7]} · vista diaria`
      : calView === 'week'
        ? `Semana del ${weekStart.getDate()} – ${viewEnd4.getDate()} ${MONTHS_ES[viewEnd4.getMonth()]}`
        : `${MONTHS_ES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Calendario"
        subtitle={weekLabel}
      />

      {/* ─── Toolbar ─────────────────────────────────────────── */}
      <div className="px-6 pb-3 flex flex-wrap items-center gap-2">

        {/* Week nav */}
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={goToPrev}
            className="w-7 h-7 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-text-1 font-bold text-sm px-2 min-w-[110px] text-center">{monthLabel}</span>
          <button type="button" onClick={goToNext}
            className="w-7 h-7 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={goToToday}
            className="ml-1 px-2.5 h-7 rounded border border-border hover:bg-white/5 text-text-2 text-xs transition-colors">
            Hoy
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* Filter chips inline */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            emoji="🏥"
            placeholder="Todas las clínicas"
            value={filterClinic}
            options={clinics.map(c => ({ value: c.id, label: c.name }))}
            onChange={setFilterClinic}
          />
          <FilterChip
            emoji="👨‍⚕️"
            placeholder="Todos los doctores"
            value={filterProvider}
            options={providers.map(p => ({ value: p.id, label: `Dr. ${p.lastName}` }))}
            onChange={setFilterProvider}
          />
          <FilterChip
            emoji="🚗"
            placeholder="MVA + GP"
            value={filterType}
            options={[
              { value: 'AUTO_ACCIDENT',   label: '🚗 MVA (auto)' },
              { value: 'FAMILY_PRACTICE', label: '🩺 Family Practice' },
              { value: 'URGENT_CARE',     label: '⚡ Urgent Care' },
              { value: 'FOLLOW_UP',       label: '🔄 Follow-up' },
            ]}
            onChange={setFilterType}
          />
          {(filterClinic || filterProvider || filterType) && (
            <button
              type="button"
              onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); }}
              className="h-7 px-2 rounded border border-rose/30 text-rose text-[11px] hover:bg-rose/10 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* ml-auto spacer */}
        <div className="ml-auto" />

        {/* View toggle Día / Semana / Mes */}
        <div className="flex items-center shrink-0 rounded overflow-hidden border border-white/[0.10]">
          {(['day', 'week', 'month'] as CalendarView[]).map((v) => {
            const labels = { day: 'Día', week: 'Semana', month: 'Mes' };
            const isActive = calView === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={`px-3 h-7 text-[11px] font-semibold transition-all border-r border-white/[0.10] last:border-r-0 ${
                  isActive
                    ? 'bg-violet text-white'
                    : 'bg-transparent text-text-2 hover:bg-white/5 hover:text-text-1'
                }`}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Grid (3 views) ──────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 pb-6 min-h-0">

        {/* ══════════════════════════ WEEK VIEW ══════════════════════════════ */}
        {calView === 'week' && (() => {
          const todayStr = localDateStr(new Date());
          return (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden min-w-[640px] relative">
                {/* Header row */}
                <div className="grid grid-cols-[52px_repeat(5,1fr)] border-b border-white/[0.07]">
                  <div className="border-r border-white/[0.07]" />
                  {days.map((day, i) => {
                    const isToday = denverDateStr(day) === todayStr;
                    return (
                      <div key={i} className={`py-3 text-center border-r border-white/[0.07] last:border-r-0 ${isToday ? 'bg-cyan/[0.06]' : ''}`}>
                        <div className={`text-[9px] uppercase tracking-widest font-bold ${isToday ? 'text-cyan' : 'text-text-muted/60'}`}>{WEEKDAYS_ES[i]}</div>
                        <div className={`text-[28px] font-black leading-none mt-0.5 ${isToday ? 'text-cyan' : 'text-text-1'}`}>{day.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-bg-1/70 flex items-center justify-center z-10 rounded-xl">
                    <Clock className="w-4 h-4 animate-spin text-text-2" />
                  </div>
                )}
                {TIME_SLOTS.map(slot => (
                  <div key={slot} className="grid grid-cols-[52px_repeat(5,1fr)] border-b border-white/[0.04] last:border-b-0 min-h-[40px]">
                    <div className="border-r border-white/[0.04] flex items-start justify-end pr-2 pt-1">
                      <span className="text-[9px] text-white/30 font-mono tabular-nums">{slot}</span>
                    </div>
                    {days.map((day, di) => {
                      const dayKey = localDateStr(day);
                      const isToday = dayKey === todayStr;
                      const cellAppts = apptMap[dayKey]?.[slot] ?? [];
                      return (
                        <div key={di} className={`border-r border-white/[0.04] last:border-r-0 p-0.5 flex flex-col gap-0.5 ${isToday ? 'bg-cyan/[0.025]' : ''}`}>
                          {cellAppts.map(appt => {
                            const s = getEventStyle(appt);
                            const visitLabel = appt.visitNumber === 0 ? '1ra cita' : appt.visitNumber > 0 ? `visita ${appt.visitNumber + 1}` : '';
                            const drName = appt.provider ? `Dr. ${appt.provider.lastName}` : '';
                            return (
                              <button key={appt.id} type="button" onClick={() => setSelectedAppt(appt)}
                                className="w-full text-left rounded px-1.5 py-[3px] transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99]"
                                style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow }}>
                                <div className="text-[11px] font-bold leading-tight truncate" style={{ color: s.text }}>
                                  {s.badge && <span className="mr-0.5">{s.badge}</span>}
                                  {appt.patient.firstName} {appt.patient.lastName}
                                </div>
                                <div className="text-[9.5px] leading-tight truncate" style={{ color: s.text, opacity: 0.65 }}>
                                  {drName}{appt.case?.caseCode && ` · #${appt.case.caseCode.replace('PMC-','')}`}{visitLabel && ` · ${visitLabel}`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <LegendStats appointments={appointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} />
            </>
          );
        })()}

        {/* ══════════════════════════ DAY VIEW ═══════════════════════════════ */}
        {calView === 'day' && (() => {
          const dayKey  = localDateStr(weekStart);
          const todayStr = localDateStr(new Date());
          const isToday  = dayKey === todayStr;
          const dowIdx   = (weekStart.getDay() + 6) % 7; // 0=Mon … 6=Sun
          return (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden max-w-[640px] relative">
                {/* Header */}
                <div className="grid grid-cols-[52px_1fr] border-b border-white/[0.07]">
                  <div className="border-r border-white/[0.07]" />
                  <div className={`py-3 text-center ${isToday ? 'bg-cyan/[0.06]' : ''}`}>
                    <div className={`text-[9px] uppercase tracking-widest font-bold ${isToday ? 'text-cyan' : 'text-text-muted/60'}`}>
                      {WEEKDAYS_ALL_ES[dowIdx]}
                    </div>
                    <div className={`text-[28px] font-black leading-none mt-0.5 ${isToday ? 'text-cyan' : 'text-text-1'}`}>
                      {weekStart.getDate()}
                    </div>
                  </div>
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-bg-1/70 flex items-center justify-center z-10 rounded-xl">
                    <Clock className="w-4 h-4 animate-spin text-text-2" />
                  </div>
                )}
                {TIME_SLOTS.map(slot => {
                  const cellAppts = apptMap[dayKey]?.[slot] ?? [];
                  return (
                    <div key={slot} className="grid grid-cols-[52px_1fr] border-b border-white/[0.04] last:border-b-0 min-h-[44px]">
                      <div className="border-r border-white/[0.04] flex items-start justify-end pr-2 pt-1">
                        <span className="text-[9px] text-white/30 font-mono tabular-nums">{slot}</span>
                      </div>
                      <div className={`p-0.5 flex flex-col gap-0.5 ${isToday ? 'bg-cyan/[0.015]' : ''}`}>
                        {cellAppts.map(appt => {
                          const s = getEventStyle(appt);
                          const visitLabel = appt.visitNumber === 0 ? '1ra cita' : appt.visitNumber > 0 ? `visita ${appt.visitNumber + 1}` : '';
                          const drName = appt.provider ? `Dr. ${appt.provider.lastName}` : '';
                          return (
                            <button key={appt.id} type="button" onClick={() => setSelectedAppt(appt)}
                              className="w-full text-left rounded px-2 py-1 transition-all hover:brightness-110"
                              style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow }}>
                              <div className="text-[12px] font-bold leading-tight truncate" style={{ color: s.text }}>
                                {s.badge && <span className="mr-1">{s.badge}</span>}
                                {appt.patient.firstName} {appt.patient.lastName}
                              </div>
                              <div className="text-[10px] leading-tight truncate mt-0.5" style={{ color: s.text, opacity: 0.65 }}>
                                {drName}{appt.case?.caseCode && ` · #${appt.case.caseCode.replace('PMC-','')}`}{visitLabel && ` · ${visitLabel}`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <LegendStats appointments={appointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} />
            </>
          );
        })()}

        {/* ══════════════════════════ MONTH VIEW ═════════════════════════════ */}
        {calView === 'month' && (() => {
          const grid     = getMonthGrid(weekStart);
          const todayStr = localDateStr(new Date());
          return (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden min-w-[640px] relative">
                {/* Day-of-week headers (7 cols) */}
                <div className="grid grid-cols-7 border-b border-white/[0.07]">
                  {WEEKDAYS_ALL_ES.map(d => (
                    <div key={d} className="py-2.5 text-center border-r border-white/[0.07] last:border-r-0">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-text-muted/60">{d}</span>
                    </div>
                  ))}
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-bg-1/70 flex items-center justify-center z-10 rounded-xl">
                    <Clock className="w-4 h-4 animate-spin text-text-2" />
                  </div>
                )}
                {/* Week rows */}
                {grid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-white/[0.04] last:border-b-0" style={{ minHeight: '96px' }}>
                    {week.map((day, di) => {
                      const dayStr         = localDateStr(day);
                      const isCurrentMonth = day.getMonth() === weekStart.getMonth();
                      const isToday        = dayStr === todayStr;
                      // Flatten all slots for this day
                      const dayAppts = Object.values(apptMap[dayStr] ?? {}).flat();
                      const visible  = dayAppts.slice(0, 3);
                      const overflow = dayAppts.length - visible.length;
                      return (
                        <div key={di}
                          className={`border-r border-white/[0.04] last:border-r-0 p-1.5 flex flex-col ${
                            !isCurrentMonth ? 'opacity-[0.22]' : ''
                          } ${isToday ? 'bg-cyan/[0.04]' : ''}`}>
                          {/* Date circle */}
                          <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-bold mb-1 shrink-0 ${
                            isToday ? 'bg-cyan text-bg-1' : 'text-text-1'
                          }`}>
                            {day.getDate()}
                          </div>
                          {/* Mini cards */}
                          {visible.map(appt => {
                            const s = getEventStyle(appt);
                            return (
                              <button key={appt.id} type="button" onClick={() => setSelectedAppt(appt)}
                                className="w-full text-left text-[9.5px] px-1.5 py-[2px] rounded mb-[2px] truncate font-semibold transition-all hover:brightness-110"
                                style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, boxShadow: appt.visitNumber === 0 ? s.glow : undefined }}>
                                {s.badge && <span className="mr-0.5">{s.badge}</span>}
                                {appt.patient.firstName} {appt.patient.lastName[0]}.
                              </button>
                            );
                          })}
                          {overflow > 0 && (
                            <div className="text-[9px] text-text-muted text-center">+{overflow} más</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <LegendStats appointments={appointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} />
            </>
          );
        })()}

        {/* Empty state */}
        {!loading && appointments.length === 0 && (
          <div className="mt-12 text-center">
            <CalendarDays className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-2 text-sm">No hay citas este período</p>
            <p className="text-text-muted text-xs mt-1">Agenda una cita desde el Front Office (B.2)</p>
          </div>
        )}
      </div>

      {/* ─── Detail panel (B.11) ─────────────────────────────── */}
      {selectedAppt && (
        <AppointmentDetailPanel
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
