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
import { ChevronLeft, ChevronRight, CalendarDays, Filter, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';

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
    preferredLanguage: string | null;
  };
  case: {
    id: string;
    caseCode: string;
    accidentType: string | null;
    accidentDate: string | null;
    status: string;
    intakeFormCompletedAt: string | null;
    lawyer: { id: string; firmName: string | null; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
    insurance: { id: string; name: string } | null;
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

function slotOf(isoString: string): string {
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, '0');
  const m = d.getMinutes() < 30 ? '00' : '30';
  return `${h}:${m}`;
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
  const [showFilters,    setShowFilters]     = useState(false);

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
  type ApptMap = Record<string, Record<string, CalendarAppointment[]>>; // dayISO → slot → []
  const apptMap: ApptMap = {};
  for (const appt of appointments) {
    const d   = new Date(appt.scheduledFor);
    const day = d.toISOString().slice(0, 10);
    const slot = slotOf(appt.scheduledFor);
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
      <div className="px-6 pb-3 flex flex-wrap items-center gap-3">
        {/* Week nav */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrev}
            className="w-8 h-8 rounded-md border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-text-1 font-bold text-sm px-2 min-w-[120px] text-center">{monthLabel}</span>
          <button
            type="button"
            onClick={goToNext}
            className="w-8 h-8 rounded-md border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="ml-1 px-3 h-8 rounded-md border border-border hover:bg-white/5 text-text-2 text-xs transition-colors"
          >
            Hoy
          </button>
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs transition-all ${
            showFilters || filterClinic || filterProvider || filterType
              ? 'border-cyan/40 bg-cyan/10 text-cyan'
              : 'border-border text-text-2 hover:border-border-strong'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {(filterClinic || filterProvider || filterType) && (
            <span className="bg-cyan text-bg-1 text-[9px] font-bold px-1 rounded-full">
              {[filterClinic, filterProvider, filterType].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-text-muted">
          <span className="text-text-2">{appointments.length} citas</span>
          {firstVisitCount > 0 && (
            <span className="text-rose font-semibold">{firstVisitCount} primeras 🆕</span>
          )}
          {pendingConfirm > 0 && (
            <span className="text-amber">{pendingConfirm} sin confirmar</span>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mx-6 mb-3 p-3 rounded-lg border border-border bg-bg-2/40 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Clínica</label>
            <select
              value={filterClinic}
              onChange={e => setFilterClinic(e.target.value)}
              className="bg-bg-1 border border-border rounded-md text-text-1 text-xs px-2 py-1.5"
            >
              <option value="">Todas las clínicas</option>
              {clinics.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Doctor</label>
            <select
              value={filterProvider}
              onChange={e => setFilterProvider(e.target.value)}
              className="bg-bg-1 border border-border rounded-md text-text-1 text-xs px-2 py-1.5"
            >
              <option value="">Todos los doctores</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>Dr. {p.lastName}, {p.firstName}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Tipo de caso</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-bg-1 border border-border rounded-md text-text-1 text-xs px-2 py-1.5"
            >
              <option value="">Todos</option>
              <option value="AUTO_ACCIDENT">MVA (Auto Accident)</option>
              <option value="FAMILY_PRACTICE">GP (Family Practice)</option>
              <option value="URGENT_CARE">Urgent Care</option>
              <option value="FOLLOW_UP">Follow-up</option>
            </select>
          </div>
          {(filterClinic || filterProvider || filterType) && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); }}
                className="px-3 py-1.5 text-xs text-rose border border-rose/30 rounded-md hover:bg-rose/10 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

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
                const dayKey = day.toISOString().slice(0, 10);
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
