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

import { useState, useEffect, useCallback } from 'react';
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

const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const MONTHS_ES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const TIME_SLOTS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
                    '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ─── Timezone helpers (Mountain Time / America/Denver) ────────────────────────
// Toda la clínica opera en Utah (MDT = UTC−6 / MST = UTC−7).
// Usamos 'America/Denver' para que el calendario sea correcto sin importar
// la timezone del browser del usuario.

function denverDateStr(d: Date): string {
  // Returns 'YYYY-MM-DD' in America/Denver timezone
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
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

  // Load appointments for the current week
  const loadWeek = useCallback(async (start: Date) => {
    setLoading(true);
    const end = addDays(start, 4);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      from: start.toISOString(),
      to:   end.toISOString(),
      ...(filterClinic   ? { clinicId:   filterClinic }   : {}),
      ...(filterProvider ? { providerId: filterProvider } : {}),
      ...(filterType     ? { type:       filterType }     : {}),
    });
    try {
      const res  = await fetch(`/api/admin/appointments?${params}`);
      const data = await res.json();
      setAppointments(data.appointments ?? []);
    } catch { /* silently fail, show empty */ }
    finally { setLoading(false); }
  }, [filterClinic, filterProvider, filterType]);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  const goToPrev  = () => setWeekStart(w => addDays(w, -7));
  const goToNext  = () => setWeekStart(w => addDays(w,  7));
  const goToToday = () => setWeekStart(getMondayOf(new Date()));

  // Build the 5-day headers
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Index appointments by day×slot for quick lookup
  type ApptMap = Record<string, Record<string, CalendarAppointment[]>>; // dayDenver → slot → []
  const apptMap: ApptMap = {};
  for (const appt of appointments) {
    const d   = new Date(appt.scheduledFor);
    const day  = denverDateStr(d);          // ← Denver date, was: d.toISOString().slice(0,10)
    const slot = slotOf(appt.scheduledFor); // ← Denver hour slot
    if (!apptMap[day]) apptMap[day] = {};
    if (!apptMap[day][slot]) apptMap[day][slot] = [];
    apptMap[day][slot].push(appt);
  }

  const firstVisitCount = appointments.filter(a => a.visitNumber === 0).length;
  const pendingConfirm  = appointments.filter(a => a.status === 'SCHEDULED').length;

  const monthLabel = `${MONTHS_ES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
  const weekLabel  = `Semana del ${weekStart.getDate()} – ${addDays(weekStart, 4).getDate()} ${MONTHS_ES[addDays(weekStart, 4).getMonth()]}`;

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

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-text-muted shrink-0">
          <span className="text-text-2">{appointments.length} citas</span>
          {firstVisitCount > 0 && (
            <span className="text-rose font-semibold">{firstVisitCount} primeras 🆕</span>
          )}
          {pendingConfirm > 0 && (
            <span className="text-amber">{pendingConfirm} sin confirmar</span>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* View toggle Día / Semana / Mes */}
        <div className="flex items-center shrink-0">
          {(['day', 'week', 'month'] as CalendarView[]).map((v, i) => {
            const labels = { day: 'Día', week: 'Semana', month: 'Mes' };
            const isActive = calView === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setCalView(v)}
                className={`px-3 h-7 text-[11px] font-medium border transition-colors ${
                  i === 0 ? 'rounded-l' : i === 2 ? 'rounded-r' : ''
                } ${
                  isActive
                    ? 'border-cyan bg-cyan/15 text-cyan z-10 relative'
                    : 'border-border text-text-2 hover:bg-white/5 -ml-px'
                }`}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Grid ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 pb-6 min-h-0">
        <div className="rounded-lg border border-border bg-bg-1 overflow-hidden min-w-[700px]">

          {/* Header row — días */}
          <div className="grid grid-cols-[64px_repeat(5,1fr)] border-b border-border">
            <div className="border-r border-border" />
            {days.map((day, i) => {
              const isToday = day.getTime() === today.getTime();
              return (
                <div
                  key={i}
                  className={`py-2.5 text-center border-r border-border last:border-r-0 ${isToday ? 'bg-cyan/5' : ''}`}
                >
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? 'text-cyan' : 'text-text-muted'}`}>
                    {WEEKDAYS_ES[i]}
                  </div>
                  <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-cyan' : 'text-text-1'}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-bg-1/60 flex items-center justify-center z-10 rounded-lg">
              <div className="flex items-center gap-2 text-text-2 text-sm">
                <Clock className="w-4 h-4 animate-spin" />
                Cargando citas...
              </div>
            </div>
          )}

          {/* Time slots */}
          {TIME_SLOTS.map((slot) => (
            <div key={slot} className="grid grid-cols-[64px_repeat(5,1fr)] border-b border-border/50 last:border-b-0 min-h-[52px]">
              {/* Time label */}
              <div className="border-r border-border flex items-start justify-end pr-2.5 pt-1.5">
                <span className="text-[10px] text-text-muted font-mono">{slot}</span>
              </div>

              {/* Day cells */}
              {days.map((day, di) => {
                const dayKey = denverDateStr(day);          // ← Denver date key
                const isToday = day.getTime() === today.getTime();
                const cellAppts = apptMap[dayKey]?.[slot] ?? [];

                return (
                  <div
                    key={di}
                    className={`border-r border-border/50 last:border-r-0 p-1 flex flex-col gap-1 ${isToday ? 'bg-cyan/[0.02]' : ''}`}
                  >
                    {cellAppts.map(appt => {
                      const style = getEventStyle(appt);
                      const isFirst = appt.visitNumber === 0;
                      const drName = appt.provider
                        ? `Dr. ${appt.provider.lastName}`
                        : '';
                      const visitLabel = isFirst
                        ? '1ra cita'
                        : appt.visitNumber > 0
                          ? `visita ${appt.visitNumber + 1}`
                          : '';

                      return (
                        <button
                          key={appt.id}
                          type="button"
                          onClick={() => setSelectedAppt(appt)}
                          className="w-full text-left rounded-md px-2 py-1.5 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            background: style.bg,
                            border: `1px solid ${style.border}`,
                            boxShadow: style.glow,
                          }}
                        >
                          <div
                            className="text-[11px] font-semibold truncate"
                            style={{ color: style.text }}
                          >
                            {style.badge && <span className="mr-1">{style.badge}</span>}
                            {appt.patient.firstName} {appt.patient.lastName}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {drName}
                            {appt.case?.caseCode && (
                              <span className="font-mono"> · #{appt.case.caseCode.replace('PMC-', '')}</span>
                            )}
                            {visitLabel && <span> · {visitLabel}</span>}
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

        {/* ─── Leyenda ─────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {[
            { color: 'rgba(244,63,94,0.75)', label: 'MVA · seguimiento' },
            { color: 'linear-gradient(135deg,#f43f5e,#ec4899)', label: '🆕 MVA · 1ra cita', glow: true },
            { color: 'rgba(16,185,129,0.75)', label: 'GP · seguimiento' },
            { color: 'linear-gradient(135deg,#10b981,#14b8a6)', label: '🆕 GP · 1ra cita', glow: true },
            { color: 'rgba(245,158,11,0.75)', label: 'Sin confirmar' },
            { color: 'rgba(99,102,241,0.50)', label: 'Atendida ✓' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div
                className="w-4 h-2 rounded-sm shrink-0"
                style={{
                  background: item.color,
                  boxShadow: item.glow ? '0 0 5px rgba(244,63,94,0.45)' : undefined,
                }}
              />
              <span className="text-[11px] text-text-muted">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!loading && appointments.length === 0 && (
          <div className="mt-12 text-center">
            <CalendarDays className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-2 text-sm">No hay citas esta semana</p>
            <p className="text-text-muted text-xs mt-1">
              Agenda una cita desde el Front Office (B.2)
            </p>
          </div>
        )}
      </div>

      {/* ─── Detail panel (B.11) ─────────────────────────────── */}
      {selectedAppt && (
        <AppointmentDetailPanel
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onRefresh={() => loadWeek(weekStart)}
        />
      )}
    </div>
  );
}
