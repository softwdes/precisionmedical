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

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Clock, Plus, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';

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
  isOnline: boolean;
  meetingUrl: string | null;
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

const TIME_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30',
  '20:00','20:30','21:00','21:30',
];

/** Returns "8 AM" for on-the-hour slots, empty string for :30 slots */
function slotLabel(slot: string): string {
  const [h, m] = slot.split(':').map(Number);
  if (m !== 0) return '';
  const period = h! < 12 ? 'AM' : 'PM';
  const h12    = h! % 12 === 0 ? 12 : h! % 12;
  return `${h12} ${period}`;
}

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

/**
 * Convert a Denver local date+time (dayKey=YYYY-MM-DD, slot=HH:MM) to a UTC ISO string.
 * Handles DST automatically by probing both MDT (UTC-6) and MST (UTC-7).
 */
function denverSlotToISO(dayKey: string, slot: string): string {
  const y = +dayKey.slice(0, 4);
  const mo = +dayKey.slice(5, 7) - 1;
  const d = +dayKey.slice(8, 10);
  const [h, m] = slot.split(':').map(Number) as [number, number];
  for (const offsetH of [6, 7]) {
    const utc = new Date(Date.UTC(y, mo, d, h + offsetH, m));
    const parts = utc.toLocaleString('en-US', {
      timeZone: 'America/Denver',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).split(', ');
    if (parts.length < 2) continue;
    const [datePart, timePart] = parts;
    const [mo2, d2, y2] = datePart!.split('/');
    const localDay = `${y2}-${mo2}-${d2}`;
    const localSlot = (timePart ?? '').replace(/^24:/, '00:');
    if (localDay === dayKey && localSlot === slot) return utc.toISOString();
  }
  // Fallback: assume MDT
  return new Date(Date.UTC(y, mo, d, h + 6, m)).toISOString();
}

/** True if a slot (HH:MM in Denver time) on dayKey (YYYY-MM-DD Denver) is already past */
function slotIsPast(dayKey: string, slot: string): boolean {
  const nowDenverDate = denverDateStr(new Date());
  if (dayKey < nowDenverDate) return true;
  if (dayKey > nowDenverDate) return false;
  const nowTime = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/Denver', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  return slot <= nowTime;
}

/** Returns "8:00–8:30 AM" style range label in Denver time */
function apptTimeRange(iso: string, durationMinutes: number): string {
  const start = new Date(iso);
  const end   = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
  return `${fmt(start)}–${fmt(end)}`;
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
  appointments, firstVisitCount, pendingConfirm, t,
}: {
  appointments: CalendarAppointment[];
  firstVisitCount: number;
  pendingConfirm: number;
  t: ReturnType<typeof useTranslations<'phoenix.calendar'>>;
}) {
  return (
    <div className="mt-3 flex items-center justify-between flex-wrap gap-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {([
          { color: 'rgba(244,63,94,0.75)',                              label: t('legendMvaFollowUp') },
          { color: 'linear-gradient(135deg,#f43f5e,#ec4899)',           label: t('legendMvaFirst'), glow: true },
          { color: 'rgba(16,185,129,0.75)',                             label: t('legendGpFollowUp') },
          { color: 'linear-gradient(135deg,#10b981,#14b8a6)',           label: t('legendGpFirst'), glow: true },
          { color: 'rgba(245,158,11,0.75)',                             label: t('legendUnconfirmed') },
          { color: 'rgba(99,102,241,0.50)',                             label: t('legendAttended') },
        ] as { color: string; label: string; glow?: boolean }[]).map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-1.5 rounded-sm shrink-0"
              style={{ background: item.color, boxShadow: item.glow ? '0 0 4px rgba(244,63,94,0.40)' : undefined }} />
            <span className="text-[10px] text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted shrink-0">
        <span><span className="text-text-2 font-semibold">{appointments.length}</span> {t('statAppointments')}</span>
        {firstVisitCount > 0 && <span className="text-rose font-semibold">{firstVisitCount} {t('statFirstVisits')} 🆕</span>}
        {pendingConfirm  > 0 && <span className="text-amber">{pendingConfirm} {t('statUnconfirmed')}</span>}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CalendarClient({ clinics, providers }: CalendarClientProps) {
  const t = useTranslations('phoenix.calendar');

  const WEEKDAYS     = Object.values(t.raw('weekdays') as Record<string, string>);
  const WEEKDAYS_ALL = Object.values(t.raw('weekdaysAll') as Record<string, string>);
  const MONTHS       = Object.values(t.raw('months') as Record<string, string>);

  const [weekStart, setWeekStart]       = useState<Date>(() => getMondayOf(new Date()));
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);

  // Filters
  const [filterClinic,   setFilterClinic]   = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterType,     setFilterType]     = useState('');

  // Patient search with dropdown
  const [patientSearch,   setPatientSearch]   = useState('');
  const [patientResults,  setPatientResults]  = useState<Array<{ id: string; firstName: string; lastName: string; phone: string | null }>>([]);
  const [searchingPt,     setSearchingPt]     = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [patientQuery,    setPatientQuery]     = useState(''); // for client-side filter (selected patient id)
  const [calView, setCalView] = useState<CalendarView>('week');

  // ─── Data loading — AbortController pattern ──────────────────────────────
  // Cada vez que cambia weekStart, calView o filtros, el efecto se re-ejecuta.
  // El cleanup cancela la petición anterior a nivel de red (AbortController),
  // imposibilitando que una respuesta stale sobreescriba datos frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [newApptOpen, setNewApptOpen]     = useState(false);
  const [slotDate,    setSlotDate]        = useState('');
  const [slotTime,    setSlotTime]        = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Mobile agenda has its own date (starts at TODAY, not Monday of week)
  const [mobileDate, setMobileDate] = useState<Date>(() => new Date());
  type MobileView = 'day' | 'week' | 'month';
  const [mobileView, setMobileView] = useState<MobileView>('day');

  const openSlot = (date: string, time: string) => {
    setSlotDate(date);
    setSlotTime(time);
    setNewApptOpen(true);
  };

  // ─── Drag & Drop reschedule ──────────────────────────────────────────────
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dropTarget,  setDropTarget]  = useState<string | null>(null); // 'dayKey|slot'
  const [dragSaving,  setDragSaving]  = useState(false);
  const [dragError,   setDragError]   = useState<string | null>(null);

  const handleDrop = async (dayKey: string, slot: string) => {
    const apptId = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!apptId) return;
    const appt = appointments.find(a => a.id === apptId);
    if (!appt) return;
    // No-op if dropped on same slot
    if (denverDateStr(new Date(appt.scheduledFor)) === dayKey && slotOf(appt.scheduledFor) === slot) return;
    setDragSaving(true);
    setDragError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: denverSlotToISO(dayKey, slot) }),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const data = await res.json() as { message?: string; error?: string };
        setDragError(data.message ?? data.error ?? 'Error al reprogramar');
        setTimeout(() => setDragError(null), 4000);
      }
    } catch {
      setDragError('Error de conexión');
      setTimeout(() => setDragError(null), 4000);
    } finally {
      setDragSaving(false);
    }
  };

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
    // Expand range to cover full mobile view (day / week / month)
    let mobStart: Date, mobEnd: Date;
    if (mobileView === 'week') {
      const wMon = getMondayOf(mobileDate);
      mobStart = new Date(wMon); mobStart.setHours(0, 0, 0, 0);
      mobEnd   = addDays(wMon, 6); mobEnd.setHours(23, 59, 59, 999);
    } else if (mobileView === 'month') {
      const grid = getMonthGrid(mobileDate);
      mobStart = new Date(grid[0][0]); mobStart.setHours(0, 0, 0, 0);
      const lastW = grid[grid.length - 1];
      mobEnd = new Date(lastW[lastW.length - 1]); mobEnd.setHours(23, 59, 59, 999);
    } else {
      mobStart = new Date(mobileDate); mobStart.setHours(0, 0, 0, 0);
      mobEnd   = new Date(mobileDate); mobEnd.setHours(23, 59, 59, 999);
    }
    if (mobStart < from) from = mobStart;
    if (mobEnd   > to)   to   = mobEnd;

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
  }, [weekStart, calView, mobileDate, mobileView, filterClinic, filterProvider, filterType, refreshKey]); // eslint-disable-line

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
  // Mobile nav — step depends on mobileView
  const mobileGoToPrev = () => {
    if (mobileView === 'week')       setMobileDate(d => addDays(d, -7));
    else if (mobileView === 'month') setMobileDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else                             setMobileDate(d => addDays(d, -1));
  };
  const mobileGoToNext = () => {
    if (mobileView === 'week')       setMobileDate(d => addDays(d, 7));
    else if (mobileView === 'month') setMobileDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else                             setMobileDate(d => addDays(d, 1));
  };
  const mobileGoToToday = () => setMobileDate(new Date());
  /** Cambia de vista ajustando weekStart al ancla correcta para esa vista. */
  const switchView = (v: CalendarView) => {
    setCalView(v);
    if (v === 'week')       setWeekStart(w => getMondayOf(w));
    else if (v === 'day')   setWeekStart(new Date()); // siempre muestra HOY al cambiar a día
    else if (v === 'month') setWeekStart(w => getFirstDayOfMonth(w));
    // day: mantiene el weekStart actual como "día seleccionado"
  };

  // ─── Patient search dropdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (selectedPatient) return; // ya hay selección, no buscar
    if (patientSearch.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(() => {
      setSearchingPt(true);
      fetch(`/api/admin/patients/search?q=${encodeURIComponent(patientSearch)}`)
        .then(r => r.json())
        .then(d => setPatientResults(d.results ?? []))
        .catch(() => {})
        .finally(() => setSearchingPt(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [patientSearch, selectedPatient]);

  const selectPatient = (p: { id: string; firstName: string; lastName: string; phone: string | null }) => {
    setSelectedPatient(p);
    setPatientSearch('');
    setPatientResults([]);
    setPatientQuery(p.id);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setPatientResults([]);
    setPatientQuery('');
  };

  const [filterSpecialty, setFilterSpecialty] = useState('');

  // ─── Filter appointments by selected patient + specialty (client-side) ────────
  const visibleAppointments = useMemo(() => {
    let result = patientQuery ? appointments.filter(a => a.patient.id === patientQuery) : appointments;
    if (filterSpecialty) result = result.filter(a => a.provider?.specialty === filterSpecialty);
    return result;
  }, [appointments, patientQuery, filterSpecialty]);

  // Unique specialty options derived from loaded appointments
  const specialtyOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<{ value: string; label: string }> = [];
    for (const a of appointments) {
      const s = a.provider?.specialty;
      if (s && !seen.has(s)) { seen.add(s); opts.push({ value: s, label: s }); }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [appointments]);

  // ─── Derived state ───────────────────────────────────────────────────────────
  // 5-day header array (week view)
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  // O(1) lookup: Denver-date → slot → appointments[]
  type ApptMap = Record<string, Record<string, CalendarAppointment[]>>;
  const apptMap: ApptMap = {};
  for (const appt of visibleAppointments) {
    const day  = denverDateStr(new Date(appt.scheduledFor));
    const slot = slotOf(appt.scheduledFor);
    if (!apptMap[day]) apptMap[day] = {};
    if (!apptMap[day][slot]) apptMap[day][slot] = [];
    apptMap[day][slot].push(appt);
  }

  const firstVisitCount = visibleAppointments.filter(a => a.visitNumber === 0).length;
  const pendingConfirm  = visibleAppointments.filter(a => a.status === 'SCHEDULED').length;

  // Labels en barra de título
  const viewEnd4   = addDays(weekStart, 4);
  const monthLabel =
    calView === 'day'
      ? `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
      : `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
  // Mobile toolbar label — changes by view
  const mobileDateLabel = mobileView === 'month'
    ? `${MONTHS[mobileDate.getMonth()]} ${mobileDate.getFullYear()}`
    : mobileView === 'week'
      ? (() => { const mon = getMondayOf(mobileDate); const sun = addDays(mon, 6); return `${mon.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`; })()
      : `${mobileDate.getDate()} ${MONTHS[mobileDate.getMonth()]} ${mobileDate.getFullYear()}`;
  const weekLabel =
    calView === 'day'
      ? `${WEEKDAYS_ALL[(weekStart.getDay() + 6) % 7]} · ${t('viewDailySuffix')}`
      : calView === 'week'
        ? t('weekRangeLabel', { start: weekStart.getDate(), end: viewEnd4.getDate(), month: MONTHS[viewEnd4.getMonth()] })
        : `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title={t('pageTitle')}
        subtitle={weekLabel}
      />

      {/* ─── Drag & Drop feedback ── */}
      {dragSaving && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-cyan/40 bg-bg-1/95 backdrop-blur px-4 py-2 shadow-xl">
          <Clock className="w-3.5 h-3.5 animate-spin text-cyan" />
          <span className="text-text-1 text-sm font-medium">{t('dragRescheduling')}</span>
        </div>
      )}
      {dragError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-rose/40 bg-bg-1/95 backdrop-blur px-4 py-2 shadow-xl">
          <span className="text-rose text-sm font-medium">{t('dragError')}</span>
        </div>
      )}

      {/* ─── Mobile toolbar (md:hidden) ──────────────────────── */}
      <div className="md:hidden px-4 pb-1 flex items-center gap-2">
        <button type="button" onClick={mobileGoToPrev}
          className="w-8 h-8 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="flex-1 text-text-1 font-bold text-sm text-center truncate">{mobileDateLabel}</span>
        <button type="button" onClick={mobileGoToNext}
          className="w-8 h-8 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button type="button" onClick={mobileGoToToday}
          className="px-2.5 h-8 rounded border border-border hover:bg-white/5 text-text-2 text-xs transition-colors">
          {t('today')}
        </button>
        <button type="button" onClick={() => setMobileFiltersOpen(v => !v)}
          className={`px-2.5 h-8 rounded border text-xs transition-colors ${mobileFiltersOpen ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-border text-text-2 hover:bg-white/5'}`}>
          {t('agendaFilters')}
        </button>
        <button type="button"
          onClick={() => { setSlotDate(''); setSlotTime(''); setNewApptOpen(true); }}
          className="w-8 h-8 rounded border border-cyan/40 bg-cyan/10 text-cyan flex items-center justify-center hover:bg-cyan/20 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {/* View switcher row — Día / Semana / Mes */}
      <div className="md:hidden px-4 pb-2 flex items-center gap-1">
        <button type="button" onClick={() => setMobileView('day')}
          className={`flex-1 h-7 rounded text-[11px] font-semibold transition-all border ${
            mobileView === 'day' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-border/60 text-text-muted hover:text-text-2 hover:border-border'
          }`}>
          {t('viewDay')}
        </button>
        <button type="button" onClick={() => setMobileView(v => v === 'week' ? 'day' : 'week')}
          className={`flex-1 h-7 rounded text-[11px] font-semibold transition-all border ${
            mobileView === 'week' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-border/60 text-text-muted hover:text-text-2 hover:border-border'
          }`}>
          {t('viewWeek')}
        </button>
        <button type="button" onClick={() => setMobileView(v => v === 'month' ? 'day' : 'month')}
          className={`flex-1 h-7 rounded text-[11px] font-semibold transition-all border ${
            mobileView === 'month' ? 'bg-cyan/15 border-cyan/40 text-cyan' : 'border-border/60 text-text-muted hover:text-text-2 hover:border-border'
          }`}>
          {t('viewMonth')}
        </button>
      </div>

      {/* Mobile collapsible filters */}
      {mobileFiltersOpen && (
        <div className="md:hidden px-4 pb-2 flex flex-wrap gap-1.5">
          <FilterChip emoji="🏥" placeholder={t('filterAllClinics')} value={filterClinic}
            options={clinics.map(c => ({ value: c.id, label: c.name }))} onChange={setFilterClinic} />
          <FilterChip emoji="👨‍⚕️" placeholder={t('filterAllDoctors')} value={filterProvider}
            options={providers.map(p => ({ value: p.id, label: `Dr. ${p.lastName}` }))} onChange={setFilterProvider} />
          <FilterChip emoji="🚗" placeholder={t('filterAllTypes')} value={filterType}
            options={[
              { value: 'AUTO_ACCIDENT',   label: t('typeAutoAccident') },
              { value: 'FAMILY_PRACTICE', label: t('typeFamilyPractice') },
              { value: 'URGENT_CARE',     label: t('typeUrgentCare') },
              { value: 'FOLLOW_UP',       label: t('typeFollowUp') },
            ]}
            onChange={setFilterType} />
          <FilterChip emoji="🩺" placeholder={t('filterAllSpecialties')} value={filterSpecialty}
            options={specialtyOptions} onChange={setFilterSpecialty} />
          {(filterClinic || filterProvider || filterType || filterSpecialty) && (
            <button type="button"
              onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); setFilterSpecialty(''); }}
              className="h-7 px-2 rounded border border-rose/30 text-rose text-[11px] hover:bg-rose/10 transition-colors">✕</button>
          )}
        </div>
      )}

      {/* ─── Desktop toolbar (hidden on mobile) ──────────────── */}
      <div className="hidden md:flex px-6 pb-3 flex-wrap items-center gap-2">

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
            {t('today')}
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* Filter chips inline */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            emoji="🏥"
            placeholder={t('filterAllClinics')}
            value={filterClinic}
            options={clinics.map(c => ({ value: c.id, label: c.name }))}
            onChange={setFilterClinic}
          />
          <FilterChip
            emoji="👨‍⚕️"
            placeholder={t('filterAllDoctors')}
            value={filterProvider}
            options={providers.map(p => ({ value: p.id, label: `Dr. ${p.lastName}` }))}
            onChange={setFilterProvider}
          />
          <FilterChip
            emoji="🚗"
            placeholder={t('filterAllTypes')}
            value={filterType}
            options={[
              { value: 'AUTO_ACCIDENT',   label: t('typeAutoAccident') },
              { value: 'FAMILY_PRACTICE', label: t('typeFamilyPractice') },
              { value: 'URGENT_CARE',     label: t('typeUrgentCare') },
              { value: 'FOLLOW_UP',       label: t('typeFollowUp') },
            ]}
            onChange={setFilterType}
          />
          <FilterChip
            emoji="🩺"
            placeholder={t('filterAllSpecialties')}
            value={filterSpecialty}
            options={specialtyOptions}
            onChange={setFilterSpecialty}
          />
          {(filterClinic || filterProvider || filterType || filterSpecialty) && (
            <button
              type="button"
              onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); setFilterSpecialty(''); }}
              className="h-7 px-2 rounded border border-rose/30 text-rose text-[11px] hover:bg-rose/10 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Patient search with dropdown */}
        <div className="relative shrink-0">
          {selectedPatient ? (
            <div className="h-7 pl-2.5 pr-7 flex items-center rounded border border-cyan/40 bg-cyan/10 text-cyan text-xs font-medium gap-1.5 w-44">
              <Search className="w-3 h-3 shrink-0" />
              <span className="truncate">{selectedPatient.firstName} {selectedPatient.lastName}</span>
              <button type="button" onClick={clearPatient} className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan/60 hover:text-cyan">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={patientSearch}
                onChange={e => setPatientSearch(e.target.value)}
                placeholder={t('searchPatientPlaceholder')}
                className="h-7 pl-7 pr-2 rounded border border-border bg-bg-2 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-cyan w-44 transition-colors"
              />
              {(searchingPt || patientResults.length > 0) && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-bg-1 border border-border rounded-md shadow-lg z-50 overflow-hidden">
                  {searchingPt && <div className="px-3 py-2 text-text-muted text-xs">{t('searching')}</div>}
                  {patientResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="text-text-1 text-xs font-medium">{p.firstName} {p.lastName}</div>
                      {p.phone && <div className="text-text-muted text-[10px]">{p.phone}</div>}
                    </button>
                  ))}
                  {!searchingPt && patientResults.length === 0 && patientSearch.length >= 2 && (
                    <div className="px-3 py-2 text-text-muted text-xs">{t('noResults')}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ml-auto spacer + Nueva cita */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setSlotDate(''); setSlotTime(''); setNewApptOpen(true); }}
            className="flex items-center gap-1.5 h-7 px-3 rounded border border-cyan/40 bg-cyan/10 text-cyan text-xs font-medium hover:bg-cyan/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('actionNewAppointment')}
          </button>
        </div>

        {/* View toggle Día / Semana / Mes */}
        <div className="flex items-center shrink-0 rounded overflow-hidden border border-white/[0.10]">
          {(['day', 'week', 'month'] as const).map((v) => {
            const labels = { day: t('viewDay'), week: t('viewWeek'), month: t('viewMonth') };
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

      {/* ─── Mobile content ──────────────────────────────────── */}
      <div className="md:hidden flex-1 overflow-auto px-4 pb-6 min-h-0">
        {/* WEEK STRIP */}
        {mobileView === 'week' && (() => {
          const mon = getMondayOf(mobileDate);
          const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
          const todayStr = localDateStr(new Date());
          const dayNames = ['M','T','W','T','F','S','S'];
          return (
            <div className="grid grid-cols-7 gap-1 mb-3">
              {weekDays.map((d, i) => {
                const dKey = denverDateStr(d);
                const isSelected = localDateStr(d) === localDateStr(mobileDate);
                const isToday = localDateStr(d) === todayStr;
                const hasAppts = visibleAppointments.some(a => denverDateStr(new Date(a.scheduledFor)) === dKey);
                return (
                  <button key={i} type="button"
                    onClick={() => setMobileDate(new Date(d))}
                    className={`flex flex-col items-center py-2 rounded-lg transition-all border ${
                      isSelected ? 'bg-cyan/20 border-cyan/40' : 'border-transparent hover:bg-white/5'
                    }`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? 'text-cyan' : 'text-text-muted'}`}>{dayNames[i]}</span>
                    <span className={`text-sm font-bold mt-0.5 ${isSelected ? 'text-cyan' : isToday ? 'text-cyan' : 'text-text-1'}`}>{d.getDate()}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${hasAppts ? 'bg-cyan' : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* MONTH GRID */}
        {mobileView === 'month' && (() => {
          const grid = getMonthGrid(mobileDate);
          const todayStr = localDateStr(new Date());
          const dayNames = ['M','T','W','T','F','S','S'];
          return (
            <div className="mb-3">
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider text-text-muted py-1">{d}</div>
                ))}
              </div>
              {grid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0.5 mb-0.5">
                  {week.map((d, di) => {
                    const dKey = denverDateStr(d);
                    const isCurrentMonth = d.getMonth() === mobileDate.getMonth();
                    const isSelected = localDateStr(d) === localDateStr(mobileDate);
                    const isToday = localDateStr(d) === todayStr;
                    const count = visibleAppointments.filter(a => denverDateStr(new Date(a.scheduledFor)) === dKey).length;
                    return (
                      <button key={di} type="button"
                        onClick={() => { setMobileDate(new Date(d)); setMobileView('day'); }}
                        className={`flex flex-col items-center py-1.5 rounded-md transition-all ${
                          isSelected ? 'bg-cyan/20 border border-cyan/40' : 'border border-transparent hover:bg-white/5'
                        } ${!isCurrentMonth ? 'opacity-30' : ''}`}>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-cyan' : isToday ? 'text-cyan' : 'text-text-1'}`}>{d.getDate()}</span>
                        {count > 0 ? (
                          <span className="text-[8px] font-bold text-cyan leading-none mt-0.5">{count}</span>
                        ) : (
                          <span className="h-3 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}

        {/* DAY AGENDA — shown always (as detail in week/month, or full in day view) */}
        {(() => {
          const dayKey = denverDateStr(mobileDate);
          const dayAppts = visibleAppointments
            .filter(a => denverDateStr(new Date(a.scheduledFor)) === dayKey)
            .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

          if (!loading && dayAppts.length === 0) {
            return (
              <div className={`text-center ${mobileView === 'day' ? 'mt-12' : 'mt-4'}`}>
                <CalendarDays className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-text-2 text-sm">{t('agendaNoAppts')}</p>
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-2">
              {mobileView !== 'day' && (
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                  {mobileDate.getDate()} {MONTHS[mobileDate.getMonth()]}
                </div>
              )}
              {dayAppts.map(appt => {
                const s = getEventStyle(appt);
                const timeRange = apptTimeRange(appt.scheduledFor, appt.durationMinutes);
                const visitLabel = appt.visitNumber === 0 ? t('visitFirst') : appt.visitNumber > 0 ? t('visitN', { n: appt.visitNumber + 1 }) : '';
                const drName = appt.provider ? `Dr. ${appt.provider.lastName}` : '';
                return (
                  <button key={appt.id} type="button" onClick={() => setSelectedAppt(appt)}
                    className="w-full text-left rounded-xl p-3 transition-all hover:brightness-110 active:scale-[0.99]"
                    style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: appt.visitNumber === 0 ? s.glow : undefined }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold" style={{ color: s.text }}>{timeRange}</span>
                      {visitLabel && <span className="text-[10px] font-semibold opacity-80" style={{ color: s.text }}>{visitLabel}</span>}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: s.text }}>{appt.patient.firstName} {appt.patient.lastName}</div>
                    {(drName || appt.clinic.name) && (
                      <div className="text-[11px] mt-0.5 opacity-75" style={{ color: s.text }}>{[drName, appt.clinic.name].filter(Boolean).join(' · ')}</div>
                    )}
                    {appt.case?.caseCode && (
                      <div className="text-[10px] mt-1 opacity-60 font-mono" style={{ color: s.text }}>{appt.case.caseCode}</div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ─── Desktop: Grid (3 views, hidden on mobile) ────────── */}
      <div className="hidden md:block flex-1 overflow-auto px-6 pb-6 min-h-0">

        {/* ══════════════════════════ WEEK VIEW ══════════════════════════════ */}
        {calView === 'week' && (() => {
          const todayLocalStr = localDateStr(new Date());
          return (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden min-w-[640px] relative">
                {/* Header row */}
                <div className="grid grid-cols-[52px_repeat(5,1fr)] border-b border-white/[0.07]">
                  <div className="border-r border-white/[0.07]" />
                  {days.map((day, i) => {
                    const isToday = localDateStr(day) === todayLocalStr;
                    return (
                      <div key={i} className={`py-3 text-center border-r border-white/[0.07] last:border-r-0 ${isToday ? 'bg-cyan/[0.06]' : ''}`}>
                        <div className={`text-[9px] uppercase tracking-widest font-bold ${isToday ? 'text-cyan' : 'text-text-muted/60'}`}>{WEEKDAYS[i]}</div>
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
                      <span className="text-[9px] text-white/30 font-mono tabular-nums">{slotLabel(slot)}</span>
                    </div>
                    {days.map((day, di) => {
                      const dayKey = denverDateStr(day);
                      const isToday = localDateStr(day) === todayLocalStr;
                      const cellAppts = apptMap[dayKey]?.[slot] ?? [];
                      return (
                        <div key={di}
                          onClick={() => openSlot(dayKey, slot)}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(`${dayKey}|${slot}`); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                          onDrop={(e) => { e.preventDefault(); void handleDrop(dayKey, slot); }}
                          className={`border-r border-white/[0.04] last:border-r-0 p-0.5 flex flex-col gap-0.5 cursor-pointer group transition-colors ${
                            dropTarget === `${dayKey}|${slot}` ? 'bg-cyan/[0.12] ring-1 ring-inset ring-cyan/50' :
                            isToday ? 'bg-cyan/[0.025]' : 'hover:bg-white/[0.015]'
                          }`}>
                          {cellAppts.length === 0 && !slotIsPast(dayKey, slot) && dropTarget !== `${dayKey}|${slot}` && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center py-0.5">
                              <Plus className="w-2.5 h-2.5 text-cyan/40" />
                            </div>
                          )}
                          {dropTarget === `${dayKey}|${slot}` && cellAppts.length === 0 && (
                            <div className="flex items-center justify-center py-1">
                              <Plus className="w-2.5 h-2.5 text-cyan/60" />
                            </div>
                          )}
                          {cellAppts.map(appt => {
                            const s = getEventStyle(appt);
                            const visitLabel = appt.visitNumber === 0 ? t('visitFirst') : appt.visitNumber > 0 ? t('visitN', { n: appt.visitNumber + 1 }) : '';
                            const drName = appt.provider ? `Dr. ${appt.provider.lastName}` : '';
                            const timeRange = apptTimeRange(appt.scheduledFor, appt.durationMinutes);
                            const isDragging = draggingId === appt.id;
                            return (
                              <button key={appt.id} type="button"
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); setDraggingId(appt.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', appt.id); }}
                                onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                                onClick={(e) => { e.stopPropagation(); if (!draggingId) setSelectedAppt(appt); }}
                                className={`w-full text-left rounded px-1.5 py-[3px] transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}
                                style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow }}>
                                <div className="flex items-center gap-1 leading-tight">
                                  <span className="text-[10px] font-bold truncate tabular-nums" style={{ color: s.text }}>{timeRange}</span>
                                  {appt.isOnline && <span className="text-[9px] opacity-80 shrink-0">📹</span>}
                                  {s.badge && <span className="text-[9px] shrink-0">{s.badge}</span>}
                                </div>
                                <div className="text-[11px] font-bold leading-tight truncate" style={{ color: s.text }}>
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
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} t={t} />
            </>
          );
        })()}

        {/* ══════════════════════════ DAY VIEW ═══════════════════════════════ */}
        {calView === 'day' && (() => {
          const dayKey  = denverDateStr(weekStart);
          const todayStr = denverDateStr(new Date());
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
                      {WEEKDAYS_ALL[dowIdx]}
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
                        <span className="text-[9px] text-white/30 font-mono tabular-nums">{slotLabel(slot)}</span>
                      </div>
                      <div
                        onClick={() => openSlot(dayKey, slot)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(`${dayKey}|${slot}`); }}
                        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                        onDrop={(e) => { e.preventDefault(); void handleDrop(dayKey, slot); }}
                        className={`p-0.5 flex flex-col gap-0.5 cursor-pointer group transition-colors ${
                          dropTarget === `${dayKey}|${slot}` ? 'bg-cyan/[0.12] ring-1 ring-inset ring-cyan/50' :
                          isToday ? 'bg-cyan/[0.015]' : 'hover:bg-white/[0.015]'
                        }`}>
                        {cellAppts.length === 0 && !slotIsPast(dayKey, slot) && dropTarget !== `${dayKey}|${slot}` && (
                          <div className="flex items-center px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="w-2.5 h-2.5 text-cyan/50 mr-1 shrink-0" />
                            <span className="text-[10px] text-cyan/50 font-medium">Available</span>
                          </div>
                        )}
                        {cellAppts.map(appt => {
                          const s = getEventStyle(appt);
                          const visitLabel = appt.visitNumber === 0 ? t('visitFirst') : appt.visitNumber > 0 ? t('visitN', { n: appt.visitNumber + 1 }) : '';
                          const drName = appt.provider ? `Dr. ${appt.provider.lastName}` : '';
                          const timeRange = apptTimeRange(appt.scheduledFor, appt.durationMinutes);
                          const isDragging = draggingId === appt.id;
                          return (
                            <button key={appt.id} type="button"
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); setDraggingId(appt.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', appt.id); }}
                              onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                              onClick={(e) => { e.stopPropagation(); if (!draggingId) setSelectedAppt(appt); }}
                              className={`w-full text-left rounded px-2 py-1 transition-all hover:brightness-110 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}
                              style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow }}>
                              <div className="flex items-center gap-1 leading-tight">
                                <span className="text-[11px] font-bold truncate tabular-nums" style={{ color: s.text }}>{timeRange}</span>
                                {appt.isOnline && <span className="text-[10px] opacity-80 shrink-0">📹</span>}
                                {s.badge && <span className="text-[10px] shrink-0">{s.badge}</span>}
                              </div>
                              <div className="text-[12px] font-bold leading-tight truncate" style={{ color: s.text }}>
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
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} t={t} />
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
                  {WEEKDAYS_ALL.map(d => (
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
                            <div className="text-[9px] text-text-muted text-center">+{overflow} {t('overflowMore')}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} t={t} />
            </>
          );
        })()}

        {/* Empty state */}
        {!loading && visibleAppointments.length === 0 && (
          <div className="mt-12 text-center">
            <CalendarDays className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-2 text-sm">{t('emptyTitle')}</p>
            <p className="text-text-muted text-xs mt-1">{t('emptySubtitle')}</p>
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

      {/* ─── Nueva cita libre (B.10 free mode) ───────────────── */}
      <AppointmentDialog
        mode="free"
        open={newApptOpen}
        onOpenChange={setNewApptOpen}
        onSuccess={() => setRefreshKey(k => k + 1)}
        initialDate={slotDate || undefined}
        initialTime={slotTime || undefined}
      />
    </div>
  );
}
