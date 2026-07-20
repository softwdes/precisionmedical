'use client';

/**
 * WeeklySlotPicker — selector de horarios en vista semanal Lun–Vie
 *
 * Extrae la lógica del step 3 de NewCaseDialog para reutilizar en
 * AppointmentDialog y cualquier otro punto del sistema.
 *
 * Flujo: navega semanas → clic en día → aparecen horas disponibles → clic en hora
 */

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

// ─── Date helpers (noon-UTC trick para estabilidad con Denver TZ) ─────────────

export function getMondayOf(now: Date): Date {
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    .split('-').map(Number) as [number, number, number];
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noonUtc.getUTCDay();
  const diff = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(Date.UTC(y, m - 1, d + diff, 12, 0, 0));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function toDenverDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Slot {
  iso: string;
  label: string;    // hora formateada, ej. "8:00 A.M."
  dayLabel: string; // fecha larga, ej. "Mon, Jul 21"
}

interface Props {
  clinicId:   string;
  providerId: string;
  duration:   number;
  value:      string | null;          // ISO seleccionado
  onChange:   (iso: string) => void;
  /** Semanas hacia adelante permitidas (default 4) */
  maxWeeks?:    number;
  /** Fecha YYYY-MM-DD clickeada en el calendario → pre-selecciona semana y día */
  initialDate?: string;
  /** Hora HH:MM clickeada en el calendario → auto-selecciona slot más cercano al cargar */
  initialTime?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklySlotPicker({ clinicId, providerId, duration, value, onChange, maxWeeks = 4, initialDate, initialTime }: Props) {
  const [weekStart,   setWeekStart]   = useState<Date>(() => {
    if (initialDate) {
      const [y, m, d] = initialDate.split('-').map(Number) as [number, number, number];
      return getMondayOf(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
    }
    return getMondayOf(new Date());
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDate ?? null);
  const [slots,       setSlots]       = useState<Slot[]>([]);
  const [loading,     setLoading]     = useState(false);

  // Reset when provider/clinic/duration changes (keep initialDate if still valid)
  useEffect(() => {
    if (initialDate) {
      const [y, m, d] = initialDate.split('-').map(Number) as [number, number, number];
      setWeekStart(getMondayOf(new Date(Date.UTC(y, m - 1, d, 12, 0, 0))));
      setSelectedDay(initialDate);
    } else {
      setWeekStart(getMondayOf(new Date()));
      setSelectedDay(null);
    }
  }, [providerId, clinicId, duration, initialDate]);

  // Fetch slots for current week
  useEffect(() => {
    if (!providerId || !clinicId) { setSlots([]); return; }
    const controller = new AbortController();
    setLoading(true);
    setSlots([]);

    const fromDate = weekStart.toISOString();
    const toDate   = addDays(weekStart, 5).toISOString();
    const params   = new URLSearchParams({ clinicId, providerId, fromDate, toDate, durationMinutes: String(duration), limit: '200' });

    fetch(`/api/appointments/available-slots?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        const mapped: Slot[] = (data.slots as Array<{ startAt: string }>).map(s => {
          const d = new Date(s.startAt);
          return {
            iso: s.startAt,
            label: d.toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
            dayLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' }),
          };
        });
        setSlots(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [providerId, clinicId, duration, weekStart]);

  // Auto-seleccionar slot más cercano a initialTime cuando cargan los slots
  useEffect(() => {
    if (!initialDate || !initialTime || !slots.length || value) return;
    const [hh, mm] = initialTime.split(':').map(Number) as [number, number];
    const targetMs = hh * 60 + mm;
    const daySlots = slots.filter(s => toDenverDate(new Date(s.iso)) === initialDate);
    if (!daySlots.length) return;
    let closest = daySlots[0]!;
    let minDiff = Infinity;
    for (const s of daySlots) {
      const d = new Date(s.iso);
      const slotMs = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/Denver' })
        .split(':').reduce((acc, v, i) => acc + (i === 0 ? Number(v) * 60 : Number(v)), 0);
      const diff = Math.abs(slotMs - targetMs);
      if (diff < minDiff) { minDiff = diff; closest = s; }
    }
    onChange(closest.iso);
  }, [slots, initialDate, initialTime, value]);

  // Group slots by Denver date key
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = toDenverDate(new Date(s.iso));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [slots]);

  // Week scaffold: always Mon–Fri
  const todayDenver  = useMemo(() => toDenverDate(new Date()), []);
  const minWeekStart = useMemo(() => getMondayOf(new Date()).getTime(), []);
  const maxWeekStart = minWeekStart + maxWeeks * 7 * 86_400_000;

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d   = addDays(weekStart, i);
    const iso = toDenverDate(d);
    return {
      iso,
      isPast:    iso < todayDenver,
      slots:     slotsByDay.get(iso) ?? [],
      dayName:   d.toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'America/Denver' }),
      dayNum:    d.toLocaleDateString('en-US', { day: 'numeric',   timeZone: 'America/Denver' }),
      monthShort: d.toLocaleDateString('es-MX', { month: 'short',  timeZone: 'America/Denver' }),
    };
  }), [weekStart, slotsByDay, todayDenver]);

  const selectedDaySlots = useMemo(
    () => selectedDay ? (slotsByDay.get(selectedDay) ?? []) : [],
    [selectedDay, slotsByDay],
  );

  const isPrevDisabled = weekStart.getTime() <= minWeekStart;
  const isNextDisabled = weekStart.getTime() >= maxWeekStart;

  const prevWeek = () => { setWeekStart(d => addDays(d, -7)); setSelectedDay(null); };
  const nextWeek = () => { setWeekStart(d => addDays(d, +7)); setSelectedDay(null); };

  const selectedSlot = value ? slots.find(s => s.iso === value) : null;

  return (
    <div className="space-y-3">
      {/* ── Navegación de semana ── */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isPrevDisabled}
          onClick={prevWeek}
          className="px-2 py-1 rounded-md border border-border text-[11px] text-text-muted hover:text-text-1 hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Sem. ant.
        </button>
        <span className="text-[11px] text-text-muted font-medium">
          {weekDays[0] ? `${weekDays[0].dayNum} ${weekDays[0].monthShort} – ${weekDays[4]!.dayNum} ${weekDays[4]!.monthShort}` : ''}
        </span>
        <button
          type="button"
          disabled={isNextDisabled}
          onClick={nextWeek}
          className="px-2 py-1 rounded-md border border-border text-[11px] text-text-muted hover:text-text-1 hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        >
          Sem. sig. <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* ── 5 columnas día Lun–Vie ── */}
      <div className="grid grid-cols-5 gap-1.5">
        {weekDays.map(wd => {
          const isSelected = selectedDay === wd.iso;
          const hasSlots   = wd.slots.length > 0;
          return (
            <button
              key={wd.iso}
              type="button"
              disabled={loading || wd.isPast || !hasSlots}
              onClick={() => !wd.isPast && hasSlots && setSelectedDay(isSelected ? null : wd.iso)}
              className={`flex flex-col items-center py-2 px-1 rounded-lg border text-[10px] font-medium transition-colors ${
                isSelected
                  ? 'bg-cyan/15 border-cyan/50 text-cyan'
                  : wd.isPast
                  ? 'bg-bg-2/30 border-border/40 text-text-muted opacity-40 cursor-not-allowed'
                  : hasSlots
                  ? 'bg-bg-2 border-border text-text-2 hover:border-cyan/40 hover:bg-cyan/5 cursor-pointer'
                  : 'bg-bg-2/30 border-border/40 text-text-muted cursor-not-allowed'
              }`}
            >
              <span className="uppercase tracking-wide font-semibold">{wd.dayName}</span>
              <span className="text-sm font-bold mt-0.5">{wd.dayNum}</span>
              {loading ? (
                <div className="mt-1 w-6 h-2 rounded bg-border animate-pulse" />
              ) : hasSlots ? (
                <span className={`mt-1 text-[9px] ${isSelected ? 'text-cyan' : 'text-text-muted'}`}>
                  {wd.slots.length} hr{wd.slots.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="mt-1 text-[9px] text-text-muted/60">—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Slots del día seleccionado ── */}
      {selectedDay && selectedDaySlots.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
            {weekDays.find(d => d.iso === selectedDay)?.dayName} {weekDays.find(d => d.iso === selectedDay)?.dayNum} · selecciona hora
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedDaySlots.map(s => (
              <button
                key={s.iso}
                type="button"
                onClick={() => onChange(s.iso)}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  value === s.iso
                    ? 'bg-cyan/15 border-cyan/40 text-cyan font-semibold'
                    : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!selectedDay && !loading && providerId && clinicId && (
        <p className="text-[11px] text-text-muted italic">
          Selecciona un día para ver los horarios disponibles.
        </p>
      )}

      {/* ── Confirmación del slot seleccionado ── */}
      {selectedSlot && (
        <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-[11px] text-cyan flex items-center gap-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span><strong className="capitalize">{selectedSlot.dayLabel} · {selectedSlot.label}</strong></span>
        </div>
      )}
    </div>
  );
}
