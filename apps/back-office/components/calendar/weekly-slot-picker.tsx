'use client';
import { localeApp } from '@/lib/fechas';

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
import { useTranslations } from 'next-intl';

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
  /** Se llama cada vez que llega una lista nueva de slots (cambió duration/provider/clinic/semana) — el padre decide qué hacer con eso (ej. detectar que el slot elegido ya no aplica) */
  onSlotsFetched?: (slots: Slot[]) => void;
  /** Al editar una cita existente: excluirla del chequeo de conflictos para
   *  que su propio horario actual no se vea a sí mismo como "ocupado" y
   *  desaparezca de la lista de disponibles. */
  excludeAppointmentId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklySlotPicker({ clinicId, providerId, duration, value, onChange, maxWeeks = 4, initialDate, initialTime, onSlotsFetched, excludeAppointmentId }: Props) {
  const t = useTranslations('phoenix.calendar');
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
  const [timeTab,     setTimeTab]     = useState<'am' | 'pm' | 'evening'>('am');

  // Reset weekStart/selectedDay only when provider or clinic changes.
  // Uses functional setter to bail out when weekStart is already the correct value,
  // preventing a second fetch triggered by a new-but-same-week Date reference.
  useEffect(() => {
    const target = initialDate
      ? (() => {
          const [y, m, d] = initialDate.split('-').map(Number) as [number, number, number];
          return getMondayOf(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
        })()
      : getMondayOf(new Date());
    setWeekStart(prev => prev.getTime() === target.getTime() ? prev : target);
    setSelectedDay(initialDate ?? null);
  }, [providerId, clinicId, initialDate]); // duration intentionally excluded

  // Fetch slots for current week
  useEffect(() => {
    if (!providerId || !clinicId) { setSlots([]); return; }
    const controller = new AbortController();
    setLoading(true);
    setSlots([]);

    const fromDate = weekStart.toISOString();
    const toDate   = addDays(weekStart, 5).toISOString();
    // `limitPerDay` y NO `limit`: el techo global recortaba la semana ya ordenada
    // por fecha, así que lunes a jueves se comían los 200 cupos y el viernes
    // salía vacío — se leía como "el doctor no atiende ese día". 60 cubre el
    // máximo real de un día (56 slots, con la duración mínima de 15 min sobre
    // una jornada de 8:00 a 22:00).
    const params   = new URLSearchParams({ clinicId, providerId, fromDate, toDate, durationMinutes: String(duration), limitPerDay: '60' });
    if (excludeAppointmentId) params.set('excludeAppointmentId', excludeAppointmentId);

    fetch(`/api/appointments/available-slots?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        const mapped: Slot[] = (data.slots as Array<{ startAt: string }>).map(s => {
          const d = new Date(s.startAt);
          return {
            iso: s.startAt,
            label: d.toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
            dayLabel: d.toLocaleDateString(localeApp(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' }),
          };
        });
        setSlots(mapped);
        onSlotsFetched?.(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [providerId, clinicId, duration, weekStart, excludeAppointmentId]);

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
      const slotMs = d.toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'America/Denver' })
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
      dayName:   d.toLocaleDateString(localeApp(), { weekday: 'short', timeZone: 'America/Denver' }),
      dayNum:    d.toLocaleDateString(localeApp(), { day: 'numeric',   timeZone: 'America/Denver' }),
      monthShort: d.toLocaleDateString(localeApp(), { month: 'short',  timeZone: 'America/Denver' }),
    };
  }), [weekStart, slotsByDay, todayDenver]);

  const selectedDaySlots = useMemo(
    () => selectedDay ? (slotsByDay.get(selectedDay) ?? []) : [],
    [selectedDay, slotsByDay],
  );

  function slotHour(s: Slot): number {
    return parseInt(new Date(s.iso).toLocaleTimeString(localeApp(), { hour: 'numeric', hour12: false, timeZone: 'America/Denver' }), 10);
  }

  const amSlots      = useMemo(() => selectedDaySlots.filter(s => slotHour(s) < 12),             [selectedDaySlots]);
  const pmSlots      = useMemo(() => selectedDaySlots.filter(s => { const h = slotHour(s); return h >= 12 && h < 17; }), [selectedDaySlots]);
  const eveningSlots = useMemo(() => selectedDaySlots.filter(s => slotHour(s) >= 17),             [selectedDaySlots]);

  // Auto-switch tab to where the selected value lives, or to first non-empty tab
  useEffect(() => {
    if (!selectedDay) return;
    if (value) {
      const slot = selectedDaySlots.find(s => s.iso === value);
      if (slot) {
        const h = slotHour(slot);
        setTimeTab(h < 12 ? 'am' : h < 17 ? 'pm' : 'evening');
        return;
      }
    }
    if (amSlots.length > 0)      { setTimeTab('am');      return; }
    if (pmSlots.length > 0)      { setTimeTab('pm');      return; }
    if (eveningSlots.length > 0) { setTimeTab('evening'); return; }
  }, [selectedDay, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSlots = timeTab === 'am' ? amSlots : timeTab === 'pm' ? pmSlots : eveningSlots;

  const isPrevDisabled = weekStart.getTime() <= minWeekStart;
  const isNextDisabled = weekStart.getTime() >= maxWeekStart;

  const prevWeek = () => { setWeekStart(d => addDays(d, -7)); setSelectedDay(null); };
  const nextWeek = () => { setWeekStart(d => addDays(d, +7)); setSelectedDay(null); };

  const selectedSlot = value ? slots.find(s => s.iso === value) : null;
  // Rango completo (inicio–fin) para la confirmación — mostrar solo la hora
  // de inicio no dejaba claro cuánto durará realmente la cita (15/30/45min...).
  const selectedSlotEndLabel = selectedSlot
    ? new Date(new Date(selectedSlot.iso).getTime() + duration * 60_000)
        .toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
    : null;

  return (
    <div className="space-y-3">
      {/* ── Navegación de semana ── */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isPrevDisabled}
          onClick={prevWeek}
          className="px-2.5 py-1.5 rounded-md border border-border-strong text-[11.5px] font-medium text-text-2 hover:text-brand-text hover:border-brand/50 hover:bg-brand/5 disabled:opacity-30 disabled:hover:text-text-2 disabled:hover:border-border-strong disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> {t('prevWeek')}
        </button>
        <span className="text-[11px] text-text-muted font-medium">
          {weekDays[0] ? `${weekDays[0].dayNum} ${weekDays[0].monthShort} – ${weekDays[4]!.dayNum} ${weekDays[4]!.monthShort}` : ''}
        </span>
        <button
          type="button"
          disabled={isNextDisabled}
          onClick={nextWeek}
          className="px-2.5 py-1.5 rounded-md border border-border-strong text-[11.5px] font-medium text-text-2 hover:text-brand-text hover:border-brand/50 hover:bg-brand/5 disabled:opacity-30 disabled:hover:text-text-2 disabled:hover:border-border-strong disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        >
          {t('nextWeek')} <ArrowRight className="w-3 h-3" />
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
                  {/* Son HORARIOS disponibles, no horas: con citas de 15 min,
                      52 slots son 13 horas. Decía "hrs" y en inglés fijo. */}
                  {t('slotsAvailableShort', { n: wd.slots.length })}
                </span>
              ) : (
                <span className="mt-1 text-[9px] text-text-muted">—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Slots del día seleccionado ── */}
      {selectedDay && selectedDaySlots.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
            {weekDays.find(d => d.iso === selectedDay)?.dayName} {weekDays.find(d => d.iso === selectedDay)?.dayNum} · {t('selectHour')}
          </div>

          {/* AM / PM / Evening tabs */}
          <div className="flex gap-1 mb-2">
            {([
              { key: 'am',      label: 'AM',      count: amSlots.length      },
              { key: 'pm',      label: 'PM',      count: pmSlots.length      },
              { key: 'evening', label: 'Evening', count: eveningSlots.length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                type="button"
                disabled={tab.count === 0}
                onClick={() => setTimeTab(tab.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  timeTab === tab.key
                    ? 'bg-cyan/15 border-cyan/40 text-cyan'
                    : 'bg-bg-2 border-border text-text-muted hover:text-text-2 hover:border-border-strong'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[9px] rounded-full px-1 py-0 leading-4 ${timeTab === tab.key ? 'bg-cyan/20 text-cyan' : 'bg-bg-1 text-text-muted'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[168px] overflow-y-auto pr-1">
            {visibleSlots.map(s => (
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
          {t('selectDayHint')}
        </p>
      )}

      {/* ── Confirmación del slot seleccionado — rango completo, no solo el inicio ── */}
      {selectedSlot && (
        <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-[11px] text-cyan flex items-center gap-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>
            <strong className="capitalize">{selectedSlot.dayLabel} · {selectedSlot.label} – {selectedSlotEndLabel}</strong>
            <span className="opacity-70 font-normal"> ({duration} min)</span>
          </span>
        </div>
      )}
    </div>
  );
}
