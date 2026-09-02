'use client';
import { localeApp } from '@/lib/fechas';
import { APPT_COLORS, MVA_FIRST_GLOW } from '@/lib/appointment-colors';

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
 *  CANCELLED                 → rose muy tenue + TACHADA
 *  NO_SHOW                   → text-muted (gris) + TACHADA
 *
 * El estado manda sobre el tipo: una MVA cancelada se pinta como cancelada.
 *
 * Accent del módulo: cyan (Regla #5 tabla)
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Clock, Plus, Search, X, Video, CalendarOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { TimeBlockDialog, type TimeBlock } from '@/components/calendar/time-block-dialog';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import type { CoverageDTO } from '@/lib/coverage';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { getEventStyle, edgeStyle, ONLINE_EDGE, type EventStyle } from '@/lib/appointment-style';
import { nombreProvider, nombreProviderCorto } from '@/lib/provider-name';

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
  /**
   * Cancelada el MISMO día. La API ya lo devolvía; este tipo no lo declaraba, así
   * que el dato llegaba y se descartaba, y las dos cancelaciones se pintaban
   * igual. No son lo mismo: con aviso libera la agenda, el mismo día consume el
   * horario y cobra penalidad.
   */
  cancelledSameDay?: boolean;
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
    caseType: string;
    accidentType: string | null;
    accidentDate: string | null;
    status: string;
    intakeFormCompletedAt: string | null;
    attorney: { id: string; firmName: string | null; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
    primaryInsurance: { id: string; name: string } | null;
    /** Cobertura resuelta en el server (`resolveCoverage`) — ordena el picker de cargos */
    coverage?: CoverageDTO;
  } | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

interface CalendarClientProps {
  clinics: Clinic[];
  providers: Provider[];
  /**
   * Portal médico: fija el calendario a las citas de UN doctor (sesión).
   * Oculta el filtro de doctor; el resto de la funcionalidad queda intacta.
   */
  lockedProviderId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  // Always compute the Monday in America/Denver timezone to stay consistent
  // with denverDateStr() used for appointment bucketing. Using local browser
  // time here would cause a mismatch when the user's browser is outside MT.
  const [y, m, d] = date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    .split('-').map(Number) as [number, number, number];
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noonUtc.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(y, m - 1, d + diff, 12, 0, 0));
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * La clínica solo atiende de lunes a viernes. Si `date` cae sábado o domingo,
 * devuelve el siguiente día hábil (lunes); si ya es hábil, lo devuelve igual.
 * El día de la semana se calcula en America/Denver, igual que getMondayOf(),
 * para no desfasarse si el browser está en otra timezone.
 */
function nextWeekday(date: Date): Date {
  const [y, m, d] = date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    .split('-').map(Number) as [number, number, number];
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noonUtc.getUTCDay(); // 0=Dom, 6=Sáb
  const shift = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  return shift === 0 ? noonUtc : new Date(Date.UTC(y, m - 1, d + shift, 12, 0, 0));
}

/** Igual que nextWeekday pero hacia atrás: sábado/domingo → viernes anterior. */
function prevWeekday(date: Date): Date {
  const [y, m, d] = date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    .split('-').map(Number) as [number, number, number];
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noonUtc.getUTCDay();
  const shift = dow === 6 ? -1 : dow === 0 ? -2 : 0;
  return shift === 0 ? noonUtc : new Date(Date.UTC(y, m - 1, d + shift, 12, 0, 0));
}

/**
 * Horario de atención de la clínica: 08:00 a 18:00, lunes a viernes.
 *
 * Es el rango POR DEFECTO de las tres superficies (semana, día y el selector al
 * crear la cita), no un techo rígido en las dos primeras. Antes la grilla llegaba
 * hasta las 21:30 y dibujaba cuatro filas de 20:00-21:30 todos los días para
 * 21 citas en tres años, mientras las 534 citas reales de las 07:00 quedaban
 * INVISIBLES: `slotOf()` las manda a un slot `'07:00'` que no era ninguna fila.
 *
 * El selector sí lo trata como techo — ver `WORK_HOUR_END` en
 * `api/appointments/available-slots`: ofrecer un horario en el que la clínica
 * está cerrada es un error, esconder una cita que ya existe también.
 */
const OPEN_MIN  = 8 * 60;   // 08:00
const CLOSE_MIN = 18 * 60;  // 18:00 (exclusivo → última fila 17:30 en la semana)

/** Paso de la grilla de semana/mes, en minutos. */
const WEEK_SLOT_MIN = 30;

/** Returns "8 AM" for on-the-hour slots, "8:30" for half-hour slots */
function slotLabel(slot: string): string {
  const [h, m] = slot.split(':').map(Number);
  const period = h! < 12 ? 'AM' : 'PM';
  const h12    = h! % 12 === 0 ? 12 : h! % 12;
  if (m === 0) return `${h12} ${period}`;
  // Usar los minutos reales: con la grilla de 15 min de la vista de día hay
  // slots :15 y :45. (Para los de 30 min de semana/mes el resultado es igual.)
  return `${h12}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Denver-aware: usa timezone del browser (.getFullYear()/.getMonth()) llevaba
// a que el grid mostrara un mes distinto al que decía el label de arriba
// (ese sí ya usaba dMonth/dYear, Denver-correcto) — visto en producción como
// "el mes mostrado no concuerda con las fechas mostradas".
function getFirstDayOfMonth(d: Date): Date {
  const [y, m] = denverDateStr(d).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
}

function denverMonthOf(d: Date): number {
  return parseInt(denverDateStr(d).slice(5, 7), 10) - 1;
}

/** Devuelve un array de semanas (7 días c/u) que cubren el mes completo. */
function getMonthGrid(monthRef: Date): Date[][] {
  const firstDay  = getFirstDayOfMonth(monthRef);
  const gridStart = getMondayOf(firstDay);
  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  const targetMonth = denverMonthOf(monthRef);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Terminamos cuando salimos del mes y tenemos al menos 4 semanas
    if (denverMonthOf(cursor) !== targetMonth && weeks.length >= 4) break;
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
  const t = d.toLocaleTimeString(localeApp(), {
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
// ─── Vista día: grilla de 15 min ──────────────────────────────────────────────
// La vista de día usa slots de 15 min (no 30 como semana/mes) porque el 75% de
// las citas dura 15 min y ~880 empiezan a los :15 o :45 — con 30 min se
// dibujaban en la hora equivocada y dos citas consecutivas parecian chocar.
// La semana sigue con slotOf() y su grilla de 30 min (weekSlots).

const DAY_SLOT_MIN     = 15;
/** Mismo horario de atención que la semana; se estira si el día tiene algo afuera. */
const DAY_DEFAULT_FROM = OPEN_MIN;   // 08:00
const DAY_DEFAULT_TO   = CLOSE_MIN;  // 18:00 (exclusivo → último slot 17:45)

function slotToMin(slot: string): number {
  const [h, m] = slot.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function minToSlot(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Minutos EXACTOS desde medianoche en Denver — sin bucketear.
 *
 * `slotOf`/`slotOf15` redondean, y para decidir si la grilla se estira hace falta
 * el minuto real: una cita de 15 min a las 17:45 termina a las 18:00 justo, y con
 * el bucket de 30 (`'17:30'`) el cálculo del cierre se quedaba corto.
 */
function minOf(isoString: string): number {
  const t = new Date(isoString).toLocaleTimeString(localeApp(), {
    timeZone: 'America/Denver', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const [rawH, m] = t.split(':').map(Number) as [number, number];
  return (rawH % 24) * 60 + m; // en-US + hour12:false devuelve "24:00" a medianoche
}

/** Igual que slotOf() pero redondeando a bloques de 15 min. */
function slotOf15(isoString: string): string {
  const t = new Date(isoString).toLocaleTimeString(localeApp(), {
    timeZone: 'America/Denver', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const [rawH, m] = t.split(':').map(Number) as [number, number];
  const h = rawH % 24; // en-US + hour12:false devuelve "24:00" para medianoche
  return minToSlot(h * 60 + Math.floor(m / DAY_SLOT_MIN) * DAY_SLOT_MIN);
}

function denverSlotToISO(dayKey: string, slot: string): string {
  const y = +dayKey.slice(0, 4);
  const mo = +dayKey.slice(5, 7) - 1;
  const d = +dayKey.slice(8, 10);
  const [h, m] = slot.split(':').map(Number) as [number, number];
  for (const offsetH of [6, 7]) {
    const utc = new Date(Date.UTC(y, mo, d, h + offsetH, m));
    const parts = utc.toLocaleString(localeApp(), {
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
  const nowTime = new Date().toLocaleTimeString(localeApp(), {
    timeZone: 'America/Denver', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  return slot <= nowTime;
}

/** Returns "8:00–8:30 AM" style range label in Denver time */
function apptTimeRange(iso: string, durationMinutes: number): string {
  const start = new Date(iso);
  const end   = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
  return `${fmt(start)}–${fmt(end)}`;
}

/** Solo la hora de inicio ("9:30 AM") — versión compacta para los carriles angostos de la vista semanal */
function apptTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
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

/**
 * Tarjeta de un aviso de agenda.
 *
 * Deliberadamente NEUTRA y rayada: sin nombre de paciente y sin color de tipo,
 * para que nadie la confunda con una consulta. El rayado dice "acá no hay cita"
 * mejor que cualquier color, y funciona igual en los dos temas porque sale de
 * tokens, no de un hex.
 */
function BlockCard({ block, onClick, compact, providerLabel }: {
  block: TimeBlock; onClick: () => void; compact?: boolean; providerLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={block.label}
      className={`w-full min-w-0 text-left rounded transition-all hover:brightness-125 ${compact ? 'px-1.5 py-[2px]' : 'px-2 py-1'}`}
      style={{
        background: 'repeating-linear-gradient(135deg, var(--bg-3) 0 6px, transparent 6px 12px)',
        border: '1px dashed var(--border-strong)',
        color: 'var(--text-2)',
      }}>
      <span className={`font-medium truncate block ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {block.label}
      </span>
      {/* De QUE doctor es. La celda del grid es del DIA y ahi conviven todos los
          doctores, asi que un "Lunch" suelto no dice a quien pertenece — y ese
          es justo el dato que hace falta para poder darle esa hora a otro. */}
      {providerLabel && (
        <span className={`truncate block opacity-70 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {providerLabel}
        </span>
      )}
    </button>
  );
}

// ─── LegendStats (shared entre las 3 vistas) ─────────────────────────────────

function LegendStats({
  appointments, firstVisitCount, pendingConfirm, filterClinic, t,
}: {
  appointments: CalendarAppointment[];
  firstVisitCount: number;
  pendingConfirm: number;
  /** Vacío = viendo todas las clínicas; ahí (y solo ahí) se abre el desglose. */
  filterClinic: string;
  t: ReturnType<typeof useTranslations<'phoenix.calendar'>>;
}) {
  /**
   * El total contaba las canceladas y los no-show ADENTRO.
   *
   * El calendario las pide a propósito (`includeCancelled: '1'`) para pintarlas
   * tachadas y que se vea POR QUÉ quedó un hueco libre. Pero entonces "12 citas"
   * incluía las que no van a pasar, y quien mira la agenda para saber a cuántos
   * atiende leía ese número. Ahora el total son las citas VIVAS y las otras dos
   * van al lado, con su color.
   */
  const canceladas = appointments.filter(a => a.status === 'CANCELLED' && !a.cancelledSameDay).length;
  // Aparte del anterior: es el que cobra penalidad y quema el horario. Juntarlos
  // en un solo número volvería a mezclar lo que la leyenda distingue.
  const mismoDia   = appointments.filter(a => a.status === 'CANCELLED' && a.cancelledSameDay).length;
  const noShow     = appointments.filter(a => a.status === 'NO_SHOW').length;
  const vivas      = appointments.length - canceladas - mismoDia - noShow;
  // Solo las vivas, igual que el total: una online cancelada no es una consulta
  // por video que vaya a pasar.
  const enLinea    = appointments.filter(a =>
    a.isOnline && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').length;

  /**
   * Desglose por clínica — SOLO cuando se están viendo todas.
   *
   * Con una clínica filtrada el total ya ES el de esa clínica y repetirlo es
   * ruido. Y este pie ya carga ocho ítems de leyenda: el desglose aparece
   * únicamente cuando aporta algo.
   *
   * Cuenta citas vivas, por el mismo criterio que el total.
   */
  const porClinica = useMemo(() => {
    if (filterClinic) return [];
    const mapa = new Map<string, number>();
    for (const a of appointments) {
      if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') continue;
      mapa.set(a.clinic.name, (mapa.get(a.clinic.name) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((x, y) => y[1] - x[1]);
  }, [appointments, filterClinic]);

  return (
    <div className="mt-3 flex items-center justify-between flex-wrap gap-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {([
          // Los valores salen de `lib/appointment-colors` — los comparte con la
          // grilla de tracking MVA, que pinta la franja de cada fila con el
          // mismo criterio. Antes estaban inline y solo aca.
          { color: APPT_COLORS.mvaFollowUp, label: t('legendMvaFollowUp') },
          { color: APPT_COLORS.mvaFirst,    label: t('legendMvaFirst'), glow: true },
          { color: APPT_COLORS.gpFollowUp,  label: t('legendGpFollowUp') },
          { color: APPT_COLORS.gpFirst,     label: t('legendGpFirst'), glow: true },
          { color: APPT_COLORS.unconfirmed, label: t('legendUnconfirmed') },
          { color: APPT_COLORS.attended,    label: t('legendAttended') },
          // Las que no ocurrieron van con la etiqueta TACHADA, igual que la
          // tarjeta en el grid: es la senal que las distingue de un vistazo.
          { color: APPT_COLORS.cancelled,   label: t('legendCancelled'), strike: true },
          { color: APPT_COLORS.cancelledSameDay, label: t('legendCancelledSameDay'), strike: true },
          { color: APPT_COLORS.noShow,      label: t('legendNoShow'),    strike: true },
          // El aviso de agenda no es un estado de cita: se muestra con su rayado
          // —el mismo de la tarjeta— en vez de un color plano, que lo haria
          // parecer una categoria mas de la lista.
          { color: 'repeating-linear-gradient(135deg, var(--bg-3) 0 4px, transparent 4px 8px)', label: t('legendBlock') },
        ] as { color: string; label: string; glow?: boolean; strike?: boolean }[]).map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-sm shrink-0"
              style={{ background: item.color, boxShadow: item.glow ? MVA_FIRST_GLOW : undefined }} />
            <span className="text-[12px] text-text-2 font-medium" style={{ textDecoration: item.strike ? 'line-through' : undefined }}>{item.label}</span>
          </div>
        ))}
        {/* En línea va SEPARADO de los nueve colores: no es otra categoría, es un
            modificador que se cruza con todas (una MVA puede ser online). Por eso
            la muestra no es un color de relleno sino las dos señales reales — el
            canto cyan y el icono. */}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2 rounded-sm shrink-0 bg-bg-2"
            style={{ borderLeft: `3px solid ${ONLINE_EDGE}` }} />
          <Video className="w-3 h-3 text-cyan shrink-0" />
          <span className="text-[12px] text-text-2 font-medium">{t('legendOnline')}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-text-2 font-medium shrink-0 flex-wrap justify-end">
        <span><span className="text-text-1 font-bold">{vivas}</span> {t('statAppointments')}</span>
        {firstVisitCount > 0 && <span className="text-rose font-bold">{firstVisitCount} {t('statFirstVisits')} 🆕</span>}
        {pendingConfirm  > 0 && <span className="text-amber font-bold">{pendingConfirm} {t('statUnconfirmed')}</span>}
        {enLinea > 0 && (
          <span className="text-cyan font-bold flex items-center gap-1">
            <Video className="w-3 h-3" />{enLinea} {t('statOnline')}
          </span>
        )}
        {/* Tachadas, igual que en la leyenda y en la tarjeta: es la señal que las
            distingue de un vistazo. */}
        {canceladas > 0 && (
          <span className="text-rose/70 font-bold line-through">{canceladas} {t('statCancelled')}</span>
        )}
        {mismoDia > 0 && (
          <span className="text-amber font-bold line-through">{mismoDia} {t('statCancelledSameDay')}</span>
        )}
        {noShow > 0 && (
          <span className="text-text-muted font-bold line-through">{noShow} {t('statNoShow')}</span>
        )}
        {porClinica.length > 1 && (
          <span className="flex items-center gap-2 pl-3 border-l border-border">
            {porClinica.map(([nombre, n]) => (
              <span key={nombre} className="text-text-muted">
                <span className="text-text-2 font-bold">{n}</span> {nombre}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CalendarClient({ clinics, providers, lockedProviderId }: CalendarClientProps) {
  const t = useTranslations('phoenix.calendar');
  const router   = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const WEEKDAYS     = Object.values(t.raw('weekdays') as Record<string, string>);
  const WEEKDAYS_ALL = Object.values(t.raw('weekdaysAll') as Record<string, string>);
  const MONTHS       = Object.values(t.raw('months') as Record<string, string>);

  // ─── Etiquetas de doctor ──────────────────────────────────────────────────
  // Antes era `Dr. ${lastName}` en todos lados: el prefijo se fue (ninguno de
  // los providers tiene el titulo) y quedaba el otro problema — con dos del mismo
  // apellido (Barry y Devin Clanton) el label queda ambiguo: el filtro sigue
  // siendo correcto — filtra por id, no por nombre — pero no hay forma de saber
  // a cuál de los dos se está eligiendo, y el día de uno con 27 citas se ve
  // igual de vacío que si se hubieran perdido las 3.640 del otro.
  //
  // Se desambigua SIEMPRE, no solo cuando hay choque de apellido: si el label
  // dependiera de quién más está activo, el nombre de un doctor cambiaría al dar
  // de alta a otro.
  /** Dropdowns y filtros, donde hay espacio de sobra: "Barry Clanton" */
  const drFull = nombreProvider;
  /** Tarjetas del grid: las de 15 min ya están apretadas y el nombre completo no
   *  entra — inicial y apellido alcanzan para distinguir. "B. Clanton" */
  const drShort = nombreProviderCorto;

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
  const [patientResults,  setPatientResults]  = useState<Array<{ id: string; firstName: string; lastName: string; phone: string | null; isArchived?: boolean }>>([]);
  const [searchingPt,     setSearchingPt]     = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [patientQuery,    setPatientQuery]     = useState(''); // for client-side filter (selected patient id)
  const [calView, setCalView] = useState<CalendarView>('week');

  // ─── Data loading — AbortController pattern ──────────────────────────────
  // Cada vez que cambia weekStart, calView o filtros, el efecto se re-ejecuta.
  // El cleanup cancela la petición anterior a nivel de red (AbortController),
  // imposibilitando que una respuesta stale sobreescriba datos frescos.
  /**
   * Avisos de agenda ("Lunch", "el doctor no esta"). Viven aparte de las citas y
   * NO bloquean nada: son texto para que lo lea una persona.
   */
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockPrefill, setBlockPrefill] = useState<{ date: string; time: string } | null>(null);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newApptOpen, setNewApptOpen]     = useState(false);
  const [slotDate,    setSlotDate]        = useState('');
  const [slotTime,    setSlotTime]        = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Mobile agenda has its own date (starts at TODAY, not Monday of week)
  const [mobileDate, setMobileDate] = useState<Date>(() => nextWeekday(new Date()));
  type MobileView = 'day' | 'week' | 'month';
  const [mobileView, setMobileView] = useState<MobileView>('day');

  /**
   * Abre el aviso YA con la fecha y hora de la celda. Sin esto habia que ir al
   * boton de la barra y volver a tipear un dato que ya estaba en la mano — un
   * paso de mas que el v2 no tenia, porque ahi se escribe en la fila misma.
   */
  const openBlockAt = (date: string, time: string) => {
    setEditingBlock(null);
    setBlockPrefill({ date, time });
    setBlockDialogOpen(true);
  };

  const openSlot = (date: string, time: string) => {
    setSlotDate(date);
    setSlotTime(time);
    setNewApptOpen(true);
  };

  // ─── Detalle del caso como modal ─────────────────────────────────────────
  // El panel de la cita manda al caso completo (labs, servicios, férulas y
  // cobro). El caso se abre agregando `?case=` a la URL del calendario, así que
  // el calendario NO se desmonta y un refresh vuelve con el caso encima.
  const caseModalOpen = !!searchParams.get(CASE_PARAM);

  // Abre en Laboratorios, no en el resumen del caso: desde el calendario se
  // entra a ver qué se le va a cobrar al paciente, y los labs son el primer
  // renglón de esa cuenta (decisión de Erick 2026-08-09).
  const openCase = useCallback((caseId: string, appointmentId?: string) => {
    router.push(conCasoAbierto(pathname, searchParams, caseId, 'labs', appointmentId), { scroll: false });
  }, [router, pathname, searchParams]);

  // Al volver del caso, la data del calendario puede haber cambiado (cobros,
  // labs, estado de la cita). Se refresca en la transición abierto → cerrado,
  // no en cada render: refrescar siempre dispararía un fetch por navegación.
  const caseWasOpen = useRef(false);
  useEffect(() => {
    if (caseWasOpen.current && !caseModalOpen) setRefreshKey(k => k + 1);
    caseWasOpen.current = caseModalOpen;
  }, [caseModalOpen]);

  // ─── Drag & Drop reschedule ──────────────────────────────────────────────
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dropTarget,  setDropTarget]  = useState<string | null>(null); // 'dayKey|slot'
  const [dragSaving,  setDragSaving]  = useState(false);
  const [dragError,   setDragError]   = useState<string | null>(null);
  // Cruce con otra cita del doctor: avisa y deja decidir, no bloquea (regla
  // confirmada por Erick 2026-08-05). Guarda el destino para poder reintentar
  // con allowOverlap si el usuario elige solapar igual.
  const [overlapPrompt, setOverlapPrompt] = useState<
    { apptId: string; targetIso: string; message: string } | null
  >(null);

  /** El PATCH del arrastre, en un solo lugar: el reintento con allowOverlap usa lo mismo. */
  const patchSchedule = async (apptId: string, targetIso: string, allowOverlap: boolean) => {
    setDragSaving(true);
    setDragError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: targetIso, ...(allowOverlap && { allowOverlap: true }) }),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
        return;
      }
      const data = await res.json() as { message?: string; error?: string; canOverride?: boolean };
      // Cruce que el usuario puede decidir: en vez de rechazar, se le pregunta.
      if (res.status === 409 && data.canOverride && data.message) {
        setOverlapPrompt({ apptId, targetIso, message: data.message });
        return;
      }
      // Se muestra el mensaje REAL del servidor. Antes el toast renderizaba una
      // constante ("Error al reprogramar") y descartaba este texto, así que un
      // rechazo con motivo concreto se veía como una falla aleatoria.
      setDragError(data.message ?? data.error ?? t('dragError'));
      setTimeout(() => setDragError(null), 6000);
    } catch {
      setDragError(t('dragConnectionError'));
      setTimeout(() => setDragError(null), 6000);
    } finally {
      setDragSaving(false);
    }
  };

  const handleDrop = async (dayKey: string, slot: string) => {
    const apptId = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!apptId) return;
    const appt = appointments.find(a => a.id === apptId);
    if (!appt) return;

    const targetIso = denverSlotToISO(dayKey, slot);
    // No-op solo si el destino es EXACTAMENTE el mismo instante. Antes comparaba
    // con slotOf(), que bucketea a :00/:30 — y la vista semana dibuja las :15 y
    // :45 en esa misma fila, así que mover una cita de 10:15 a la fila de 10:00
    // salía por acá sin pedido, sin toast y sin nada: la tarjeta volvía sola y
    // parecía que el arrastre no funcionaba. Son 905 citas de 14.382 en :15/:45.
    if (new Date(targetIso).getTime() === new Date(appt.scheduledFor).getTime()) return;

    await patchSchedule(apptId, targetIso, false);
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
      // Las canceladas se piden a proposito: se pintan TACHADAS para que
      // recepcion vea POR QUE un hueco quedo libre, en vez de que la cita
      // desaparezca sin rastro. El horario igual se puede volver a dar: los
      // chequeos de choque descartan las canceladas.
      includeCancelled: '1',
      ...(filterClinic ? { clinicId: filterClinic } : {}),
      ...(lockedProviderId
        ? { providerId: lockedProviderId }
        : filterProvider ? { providerId: filterProvider } : {}),
      // filterType es el tipo de CASO (MVA/GENERAL), no el tipo de cita —
      // se filtra client-side en visibleAppointments junto con specialty.
    });

    // Los avisos van en su propio pedido: son otra entidad y no deben demorar
    // ni ensuciar la carga de las citas, que es lo que la pantalla necesita.
    const paramsBloques = new URLSearchParams({
      from: from.toISOString(),
      to:   to.toISOString(),
      ...(lockedProviderId
        ? { providerId: lockedProviderId }
        : filterProvider ? { providerId: filterProvider } : {}),
    });
    fetch(`/api/admin/time-blocks?${paramsBloques}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => setBlocks(d.blocks ?? []))
      .catch(() => { /* un aviso que no carga no debe romper el calendario */ });

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
  }, [weekStart, calView, mobileDate, mobileView, filterClinic, filterProvider, refreshKey]); // eslint-disable-line

  // El panel de detalle recibía una FOTO de la cita tomada al hacer clic, y esa
  // foto nunca se refrescaba: al guardar una edición el grid se actualizaba,
  // pero el panel — y el prellenado de "Editar", que sale de él — seguían
  // mostrando los valores viejos. Se veía como "no guardó nada", y era peor que
  // eso: el PATCH manda TODOS los campos, así que la edición siguiente
  // re-enviaba los valores viejos y REVERTÍA lo que ya se había guardado.
  useEffect(() => {
    setSelectedAppt((prev) => {
      if (!prev) return prev;
      // Si la cita salió del rango visible (ej. se reagendó a otra semana) no
      // hay versión fresca en la lista — se deja la última conocida en vez de
      // cerrar el panel de golpe en la cara del usuario.
      return appointments.find((a) => a.id === prev.id) ?? prev;
    });
  }, [appointments]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const goToPrev = () => {
    // En vista día saltamos el fin de semana: lunes ← viernes.
    if (calView === 'day')        setWeekStart(w => prevWeekday(addDays(w, -1)));
    else if (calView === 'week')  setWeekStart(w => addDays(w, -7));
    else setWeekStart(w => {
      const [y, m] = denverDateStr(w).split('-').map(Number) as [number, number, number];
      return getFirstDayOfMonth(new Date(Date.UTC(y, m - 2, 1, 12, 0, 0)));
    });
  };
  const goToNext = () => {
    // En vista día saltamos el fin de semana: viernes → lunes.
    if (calView === 'day')        setWeekStart(w => nextWeekday(addDays(w, 1)));
    else if (calView === 'week')  setWeekStart(w => addDays(w, 7));
    else setWeekStart(w => {
      const [y, m] = denverDateStr(w).split('-').map(Number) as [number, number, number];
      return getFirstDayOfMonth(new Date(Date.UTC(y, m, 1, 12, 0, 0)));
    });
  };
  const goToToday = () => {
    const now = new Date();
    // Si hoy es sábado/domingo no hay agenda: mostramos el lunes siguiente.
    if (calView === 'day')        setWeekStart(nextWeekday(now));
    else if (calView === 'week')  setWeekStart(getMondayOf(now));
    else                          setWeekStart(getFirstDayOfMonth(now));
  };
  // Mobile nav — step depends on mobileView
  const mobileGoToPrev = () => {
    if (mobileView === 'week')       setMobileDate(d => addDays(d, -7));
    else if (mobileView === 'month') setMobileDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else                             setMobileDate(d => prevWeekday(addDays(d, -1)));
  };
  const mobileGoToNext = () => {
    if (mobileView === 'week')       setMobileDate(d => addDays(d, 7));
    else if (mobileView === 'month') setMobileDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else                             setMobileDate(d => nextWeekday(addDays(d, 1)));
  };
  const mobileGoToToday = () => setMobileDate(nextWeekday(new Date()));
  /** Cambia de vista ajustando weekStart al ancla correcta para esa vista. */
  const switchView = (v: CalendarView) => {
    setCalView(v);
    if (v === 'week')       setWeekStart(w => getMondayOf(w));
    else if (v === 'day')   setWeekStart(nextWeekday(new Date())); // HOY, o el lunes si hoy es finde
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

  // ─── Catálogo real de especialidades (SpecialtyCatalog) + mapa doctor→especialidades ──
  // El filtro no puede depender de lo que haya cargado en pantalla (eso solo
  // muestra las especialidades de la semana visible, nunca las 6-7 reales) ni
  // del enum legacy Provider.specialty (nombres clínicos que nadie reconoce,
  // ej. "GENERAL" en vez de "Family Practice"). Se reutiliza el mismo
  // catálogo + mapeo que ya usa AppointmentDialog vía /api/admin/scheduling/resources.
  const [specialtyCatalog, setSpecialtyCatalog] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [providerSpecialtyMap, setProviderSpecialtyMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch('/api/admin/scheduling/resources')
      .then((r) => r.json())
      .then((d) => {
        setSpecialtyCatalog(d.specialties ?? []);
        const map: Record<string, string[]> = {};
        for (const p of d.providers ?? []) map[p.id] = p.specialtyCatalogIds ?? [];
        setProviderSpecialtyMap(map);
      })
      .catch(() => {});
  }, []);

  // ─── Filter appointments by selected patient + case type + specialty (client-side) ──
  // filterType es el tipo de CASO (MVA/GENERAL) — igual que v2 — no el tipo
  // de cita (Appointment.type tiene 5 valores: auto/familia/urgencia/
  // seguimiento/consulta, que pueden darse dentro de un caso MVA o GENERAL
  // por igual, así que no son una categoría propia del filtro).
  const visibleAppointments = useMemo(() => {
    let result = patientQuery ? appointments.filter(a => a.patient.id === patientQuery) : appointments;
    if (filterType) result = result.filter(a => a.case?.caseType === filterType);
    if (filterSpecialty) {
      result = result.filter(a => a.provider?.id && (providerSpecialtyMap[a.provider.id] ?? []).includes(filterSpecialty));
    }
    return result;
  }, [appointments, patientQuery, filterType, filterSpecialty, providerSpecialtyMap]);

  // Opciones del filtro: el catálogo completo, no lo derivado de citas visibles
  const specialtyOptions = useMemo(
    () => specialtyCatalog.map((s) => ({ value: s.id, label: s.name })),
    [specialtyCatalog],
  );

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

  // Mismo bucketing que las citas: dia de Denver -> slot -> avisos.
  const blockMap: Record<string, Record<string, TimeBlock[]>> = {};
  for (const b of blocks) {
    const day  = denverDateStr(new Date(b.startsAt));
    const slot = slotOf(b.startsAt);
    if (!blockMap[day]) blockMap[day] = {};
    if (!blockMap[day][slot]) blockMap[day][slot] = [];
    blockMap[day][slot].push(b);
  }

  /**
   * Filas de la vista semana: 08:00-17:30 por defecto, estirado a la hora en
   * punto si ESTA semana tiene algo afuera.
   *
   * Antes era una constante de 08:00 a 21:30. Eso hacía dos daños a la vez:
   * dibujaba cuatro filas muertas (20:00-21:30 sirven a 21 citas en tres años) y
   * escondía sin aviso las 534 citas de las 07:00, porque su slot `'07:00'` no
   * existía como fila. Misma solución que ya tenía la vista de día.
   *
   * Se mira también `blocks`: un aviso de agenda ("el doctor no está") fuera del
   * horario tiene que verse igual, o el hueco queda tapado.
   */
  const weekSlots = useMemo(() => {
    let from = OPEN_MIN;
    let to   = CLOSE_MIN;

    const estirar = (inicioIso: string, minutos: number) => {
      const s = minOf(inicioIso);
      const e = s + Math.max(WEEK_SLOT_MIN, minutos);
      if (s < from) from = Math.floor(s / 60) * 60;
      if (e > to)   to   = Math.ceil(e / 60) * 60;
    };

    for (const a of visibleAppointments) estirar(a.scheduledFor, a.durationMinutes);
    for (const b of blocks)              estirar(b.startsAt, b.durationMinutes);

    const slots: string[] = [];
    for (let m = from; m < to; m += WEEK_SLOT_MIN) slots.push(minToSlot(m));
    return slots;
  }, [visibleAppointments, blocks]);

  const firstVisitCount = visibleAppointments.filter(a => a.visitNumber === 0).length;
  const pendingConfirm  = visibleAppointments.filter(a => a.status === 'SCHEDULED').length;

  // Labels en barra de título — always use Denver date for consistency
  const viewEnd4   = addDays(weekStart, 4);
  // Helper: get month/year/day from a Denver date string "YYYY-MM-DD"
  const dStr = (d: Date) => denverDateStr(d);
  const dNum = (d: Date) => parseInt(dStr(d).slice(8), 10);
  const dMonth = (d: Date) => MONTHS[parseInt(dStr(d).slice(5, 7), 10) - 1]!;
  const dYear = (d: Date) => parseInt(dStr(d).slice(0, 4), 10);
  const monthLabel =
    calView === 'day'
      ? `${dNum(weekStart)} ${dMonth(weekStart)} ${dYear(weekStart)}`
      : `${dMonth(weekStart)} ${dYear(weekStart)}`;
  // Mobile toolbar label — changes by view
  const mobileDateLabel = mobileView === 'month'
    ? `${dMonth(mobileDate)} ${dYear(mobileDate)}`
    : mobileView === 'week'
      ? (() => { const mon = getMondayOf(mobileDate); const sun = addDays(mon, 6); return `${dNum(mon)}–${dNum(sun)} ${dMonth(sun)} ${dYear(sun)}`; })()
      : `${dNum(mobileDate)} ${dMonth(mobileDate)} ${dYear(mobileDate)}`;
  const weekLabel =
    calView === 'day'
      ? `${WEEKDAYS_ALL[(weekStart.getDay() + 6) % 7]} · ${t('viewDailySuffix')}`
      : calView === 'week'
        ? t('weekRangeLabel', { start: dNum(weekStart), end: dNum(viewEnd4), month: dMonth(viewEnd4) })
        : `${dMonth(weekStart)} ${dYear(weekStart)}`;

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
      {/* El motivo concreto del servidor, no un cartel genérico: max-w para que
          un mensaje largo ("El doctor ya tiene una cita a las 10:15 con …") no
          se estire a todo el ancho de la pantalla. */}
      {dragError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-start gap-2 rounded-lg border border-rose/40 bg-bg-1/95 backdrop-blur px-4 py-2 shadow-xl max-w-[min(90vw,32rem)]">
          <span className="text-rose text-sm font-medium">{dragError}</span>
        </div>
      )}

      {/* Cruce de horarios: avisa con el motivo y deja decidir. */}
      <ConfirmDialog
        open={!!overlapPrompt}
        variant="warning"
        title={t('overlapTitle')}
        description={overlapPrompt?.message ?? ''}
        confirmLabel={t('overlapConfirm')}
        cancelLabel={t('overlapCancel')}
        onConfirm={() => {
          const p = overlapPrompt;
          setOverlapPrompt(null);
          if (p) void patchSchedule(p.apptId, p.targetIso, true);
        }}
        onCancel={() => setOverlapPrompt(null)}
      />


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
          {!lockedProviderId && (
            <FilterChip emoji="👨‍⚕️" placeholder={t('filterAllDoctors')} value={filterProvider}
              options={providers.map(p => ({ value: p.id, label: drFull(p) }))} onChange={setFilterProvider} />
          )}
          <FilterChip emoji="🚗" placeholder={t('filterAllTypes')} value={filterType}
            options={[
              { value: 'MVA',     label: t('filterTypeMva') },
              { value: 'GENERAL', label: t('filterTypeGm') },
            ]}
            onChange={setFilterType} />
          <FilterChip emoji="🩺" placeholder={t('filterAllSpecialties')} value={filterSpecialty}
            options={specialtyOptions} onChange={setFilterSpecialty} />
          {(filterClinic || filterProvider || filterType || filterSpecialty || selectedPatient) && (
            <button type="button"
              onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); setFilterSpecialty(''); clearPatient(); }}
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
          {!lockedProviderId && (
            <FilterChip
              emoji="👨‍⚕️"
              placeholder={t('filterAllDoctors')}
              value={filterProvider}
              options={providers.map(p => ({ value: p.id, label: drFull(p) }))}
              onChange={setFilterProvider}
            />
          )}
          <FilterChip
            emoji="🚗"
            placeholder={t('filterAllTypes')}
            value={filterType}
            options={[
              { value: 'MVA',     label: t('filterTypeMva') },
              { value: 'GENERAL', label: t('filterTypeGm') },
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
          {(filterClinic || filterProvider || filterType || filterSpecialty || selectedPatient) && (
            <button
              type="button"
              onClick={() => { setFilterClinic(''); setFilterProvider(''); setFilterType(''); setFilterSpecialty(''); clearPatient(); }}
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
                onChange={e => { const v = e.target.value; setPatientSearch(v); if (!v) { setPatientResults([]); setPatientQuery(''); } }}
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
                      className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-row-sep last:border-0"
                    >
                      {/* Se marca pero NO se bloquea: este buscador FILTRA el
                          calendario, no agenda nada. Ver las citas pasadas de un
                          paciente dado de baja es legítimo. */}
                      <div className="text-text-1 text-xs font-medium flex items-center gap-1.5">
                        <span>{p.firstName} {p.lastName}</span>
                        {p.isArchived && (
                          <span className="text-[9px] uppercase tracking-wider font-semibold px-1 py-px rounded border border-amber/30 bg-amber/10 text-amber">
                            {t('patientArchivedBadge')}
                          </span>
                        )}
                      </div>
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
          {/* Aviso de agenda — secundario y neutro: se usa mucho menos que
              agendar, y no debe competir con la accion principal. */}
          <button
            type="button"
            onClick={() => { setEditingBlock(null); setBlockPrefill(null); setBlockDialogOpen(true); }}
            className="flex items-center gap-1.5 h-7 px-3 rounded border border-border text-text-2 text-xs font-medium hover:bg-white/5 transition-colors"
          >
            <CalendarOff className="w-3.5 h-3.5" />
            {t('blockNewButton')}
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
          const todayDenver = denverDateStr(new Date());
          const selectedDenver = denverDateStr(mobileDate);
          const dayNames = ['M','T','W','T','F','S','S'];
          return (
            <div className="grid grid-cols-7 gap-1 mb-3">
              {weekDays.map((d, i) => {
                const dKey = denverDateStr(d);
                const isSelected = dKey === selectedDenver;
                const isToday = dKey === todayDenver;
                const hasAppts = visibleAppointments.some(a => denverDateStr(new Date(a.scheduledFor)) === dKey);
                return (
                  <button key={i} type="button"
                    onClick={() => setMobileDate(new Date(d))}
                    className={`flex flex-col items-center py-2 rounded-lg transition-all border ${
                      isSelected ? 'bg-cyan/20 border-cyan/40' : 'border-transparent hover:bg-white/5'
                    }`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? 'text-cyan' : 'text-text-muted'}`}>{dayNames[i]}</span>
                    <span className={`text-sm font-bold mt-0.5 ${isSelected ? 'text-cyan' : isToday ? 'text-cyan' : 'text-text-1'}`}>{parseInt(dKey.slice(8), 10)}</span>
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
          const todayDenver = denverDateStr(new Date());
          const selectedDenver = denverDateStr(mobileDate);
          const mobileMonthKey = denverDateStr(mobileDate).slice(0, 7); // "YYYY-MM"
          // Solo Lun-Vie, igual que la vista de mes de desktop y la de semana.
          const dayNames = ['M','T','W','T','F'];
          return (
            <div className="mb-3">
              <div className="grid grid-cols-5 gap-0.5 mb-1">
                {dayNames.map((d, i) => (
                  <div key={`${d}-${i}`} className="text-center text-[9px] font-bold uppercase tracking-wider text-text-muted py-1">{d}</div>
                ))}
              </div>
              {grid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-5 gap-0.5 mb-0.5">
                  {week.slice(0, 5).map((d, di) => {
                    const dKey = denverDateStr(d);
                    const isCurrentMonth = dKey.slice(0, 7) === mobileMonthKey;
                    const isSelected = dKey === selectedDenver;
                    const isToday = dKey === todayDenver;
                    const count = visibleAppointments.filter(a => denverDateStr(new Date(a.scheduledFor)) === dKey).length;
                    return (
                      <button key={di} type="button"
                        onClick={() => { setMobileDate(new Date(d)); setMobileView('day'); }}
                        className={`flex flex-col items-center py-1.5 rounded-md transition-all ${
                          isSelected ? 'bg-cyan/20 border border-cyan/40' : 'border border-transparent hover:bg-white/5'
                        } ${!isCurrentMonth ? 'opacity-30' : ''}`}>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-cyan' : isToday ? 'text-cyan' : 'text-text-1'}`}>{parseInt(dKey.slice(8), 10)}</span>
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
                const drName = appt.provider ? drShort(appt.provider) : '';
                return (
                  <button key={appt.id} type="button" onClick={() => setSelectedAppt(appt)}
                    className="w-full text-left rounded-xl p-3 transition-all hover:brightness-110 active:scale-[0.99]"
                    style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: appt.visitNumber === 0 ? s.glow : undefined, textDecoration: s.strike ? 'line-through' : undefined, ...edgeStyle(s) }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold" style={{ color: s.text }}>{timeRange}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {appt.isOnline && <Video className="w-3.5 h-3.5 text-cyan" aria-label={t('legendOnline')} />}
                        {visitLabel && <span className="text-[10px] font-semibold opacity-80" style={{ color: s.text }}>{visitLabel}</span>}
                      </span>
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
          const todayDenverStr = denverDateStr(new Date());
          return (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden min-w-[640px] relative">
                {/* Header row */}
                <div className="grid grid-cols-[58px_repeat(5,1fr)] border-b border-white/[0.07]">
                  <div className="border-r border-white/[0.07]" />
                  {days.map((day, i) => {
                    const dKey = denverDateStr(day);
                    const isToday = dKey === todayDenverStr;
                    const dayNum = parseInt(dKey.slice(8), 10);
                    return (
                      <div key={i} className={`py-3 text-center border-r border-white/[0.07] last:border-r-0 ${isToday ? 'bg-cyan/[0.06]' : ''}`}>
                        <div className={`text-[9px] uppercase tracking-widest font-bold ${isToday ? 'text-cyan' : 'text-text-muted'}`}>{WEEKDAYS[i]}</div>
                        <div className={`text-[28px] font-black leading-none mt-0.5 ${isToday ? 'text-cyan' : 'text-text-1'}`}>{dayNum}</div>
                      </div>
                    );
                  })}
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-bg-1/70 flex items-center justify-center z-10 rounded-xl">
                    <Clock className="w-4 h-4 animate-spin text-text-2" />
                  </div>
                )}
                {weekSlots.map(slot => (
                  <div key={slot} className="grid grid-cols-[58px_repeat(5,1fr)] border-b border-white/[0.04] last:border-b-0 min-h-[26px]">
                    <div className="border-r border-white/[0.04] flex items-center justify-end pr-2">
                      <span className={`font-mono tabular-nums ${slot.endsWith(':00') ? 'text-[13px] text-text-1 font-bold' : 'text-[11px] text-text-2 font-semibold'}`}>{slotLabel(slot)}</span>
                    </div>
                    {days.map((day, di) => {
                      const dayKey = denverDateStr(day);
                      const isToday = dayKey === todayDenverStr;
                      const cellAppts = apptMap[dayKey]?.[slot] ?? [];
                      const cellBlocks = blockMap[dayKey]?.[slot] ?? [];
                      return (
                        <div key={di}
                          onClick={() => openSlot(dayKey, slot)}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(`${dayKey}|${slot}`); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                          onDrop={(e) => { e.preventDefault(); void handleDrop(dayKey, slot); }}
                          className={`border-r border-white/[0.04] last:border-r-0 p-0.5 flex flex-wrap content-start gap-0.5 cursor-pointer group transition-colors min-w-0 ${
                            dropTarget === `${dayKey}|${slot}` ? 'bg-cyan/[0.12] ring-1 ring-inset ring-cyan/50' :
                            isToday ? 'bg-cyan/[0.025]' : 'hover:bg-white/[0.015]'
                          }`}>
                          {cellAppts.length === 0 && !slotIsPast(dayKey, slot) && dropTarget !== `${dayKey}|${slot}` && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 py-0.5 w-full">
                              <Plus className="w-2.5 h-2.5 text-cyan/40" />
                              {/* Segundo acceso: el aviso, con la hora ya cargada.
                                  El clic de la celda sigue siendo Nueva cita — la
                                  ruta comun no pierde nada. */}
                              <button type="button" title={t('blockNewButton')}
                                onClick={(e) => { e.stopPropagation(); openBlockAt(dayKey, slot); }}
                                className="text-text-muted hover:text-text-2 transition-colors">
                                <CalendarOff className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                          {dropTarget === `${dayKey}|${slot}` && cellAppts.length === 0 && (
                            <div className="flex items-center justify-center py-1 w-full">
                              <Plus className="w-2.5 h-2.5 text-cyan/60" />
                            </div>
                          )}
                          {cellBlocks.map(b => (
                            <BlockCard key={b.id} block={b} compact
                              providerLabel={b.providerName ?? undefined}
                              onClick={() => { setEditingBlock(b); setBlockDialogOpen(true); }} />
                          ))}
                          {cellAppts.map(appt => {
                            const s = getEventStyle(appt);
                            const visitLabel = appt.visitNumber === 0 ? t('visitFirst') : appt.visitNumber > 0 ? t('visitN', { n: appt.visitNumber + 1 }) : '';
                            const drName = appt.provider ? drShort(appt.provider) : '';
                            const isDragging = draggingId === appt.id;
                            return (
                              <button key={appt.id} type="button"
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); setDraggingId(appt.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', appt.id); }}
                                onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                                onClick={(e) => { e.stopPropagation(); if (!draggingId) setSelectedAppt(appt); }}
                                className={`grow basis-[calc(50%-2px)] min-w-0 text-left rounded px-1.5 py-[2px] transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}
                                style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow, textDecoration: s.strike ? 'line-through' : undefined, ...edgeStyle(s) }}>
                                <div className="flex items-baseline gap-1 leading-tight">
                                  <span className="text-[10px] font-bold truncate flex-1 min-w-0" style={{ color: s.text }}>
                                    {appt.patient.firstName} {appt.patient.lastName}
                                  </span>
                                  {appt.isOnline && (
                                    <Video className="w-3 h-3 shrink-0 text-cyan" aria-label={t('legendOnline')} />
                                  )}
                                  {s.badge && <span className="text-[11px] leading-none shrink-0">{s.badge}</span>}
                                  <span className="text-[8.5px] font-bold tabular-nums shrink-0" style={{ color: s.text, opacity: 0.85 }}>{apptTimeShort(appt.scheduledFor)}</span>
                                </div>
                                <div className="text-[8.5px] leading-tight truncate" style={{ color: s.text, opacity: 0.65 }}>
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
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} filterClinic={filterClinic} t={t} />
            </>
          );
        })()}

        {/* ══════════════════════════ DAY VIEW ═══════════════════════════════ */}
        {calView === 'day' && (() => {
          const dayKey   = denverDateStr(weekStart);
          const todayStr = denverDateStr(new Date());
          const isToday  = dayKey === todayStr;
          const dayNum   = parseInt(dayKey.slice(8), 10);
          // Weekday index from Denver date to avoid local-tz mismatch
          const [dy, dm, dd] = dayKey.split('-').map(Number) as [number,number,number];
          const dowIdx = (new Date(Date.UTC(dy, dm - 1, dd, 12)).getUTCDay() + 6) % 7; // 0=Mon…6=Sun

          const dayAppts = visibleAppointments.filter(
            a => denverDateStr(new Date(a.scheduledFor)) === dayKey,
          );

          // Rango dinamico: 07:00-18:00 por defecto, pero se estira (a la hora
          // en punto) si el dia tiene algo fuera — asi nunca se esconde una cita.
          let fromMin = DAY_DEFAULT_FROM;
          let toMin   = DAY_DEFAULT_TO;
          for (const a of dayAppts) {
            const s = slotToMin(slotOf15(a.scheduledFor));
            const e = s + Math.max(DAY_SLOT_MIN, a.durationMinutes);
            if (s < fromMin) fromMin = Math.floor(s / 60) * 60;
            if (e > toMin)   toMin   = Math.ceil(e / 60) * 60;
          }

          // starts: citas que ARRANCAN en el slot · covers: slots que una cita
          // ya iniciada sigue ocupando (ej. una de 30 min tapa 2 slots de 15).
          const starts: Record<string, CalendarAppointment[]> = {};
          const covers: Record<string, CalendarAppointment[]> = {};
          for (const a of dayAppts) {
            const s = slotToMin(slotOf15(a.scheduledFor));
            const dur = Math.max(DAY_SLOT_MIN, a.durationMinutes);
            (starts[minToSlot(s)] ??= []).push(a);
            for (let m = s + DAY_SLOT_MIN; m < s + dur; m += DAY_SLOT_MIN) {
              (covers[minToSlot(m)] ??= []).push(a);
            }
          }

          const allSlots: string[] = [];
          for (let m = fromMin; m < toMin; m += DAY_SLOT_MIN) allSlots.push(minToSlot(m));
          // Corte balanceado (mitad de las filas, redondeado a la hora en punto
          // = multiplo de 4 slots). Con el rango largo 07:00-22:00 cortar al
          // mediodia dejaba 20 filas contra 40; v2 tampoco corta al mediodia
          // por lo mismo. Asi las dos columnas quedan parejas.
          const splitIdx = Math.max(4, Math.min(
            allSlots.length,
            Math.round(Math.ceil(allSlots.length / 2) / 4) * 4,
          ));
          const columns = [allSlots.slice(0, splitIdx), allSlots.slice(splitIdx)];

          const renderSlotRow = (slot: string) => {
            const cellAppts = starts[slot] ?? [];
            const cellBlocks = blockMap[dayKey]?.[slot] ?? [];
            const contAppts = covers[slot] ?? [];
            const isCont    = cellAppts.length === 0 && contAppts.length > 0;
            const isDrop    = dropTarget === `${dayKey}|${slot}`;
            return (
              <div key={slot} className="grid grid-cols-[58px_1fr] border-b border-row-sep last:border-b-0 min-h-[30px]">
                <div className="border-r border-row-sep flex items-center justify-end pr-2">
                  <span className={`font-mono tabular-nums ${
                    slot.endsWith(':00') ? 'text-[12.5px] text-text-1 font-bold' : 'text-[10.5px] text-text-3 font-semibold'
                  }`}>{slotLabel(slot)}</span>
                </div>
                <div
                  onClick={() => { if (!isCont) openSlot(dayKey, slot); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(`${dayKey}|${slot}`); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                  onDrop={(e) => { e.preventDefault(); void handleDrop(dayKey, slot); }}
                  className={`p-0.5 flex gap-0.5 items-stretch group transition-colors min-w-0 ${isCont ? '' : 'cursor-pointer'} ${
                    isDrop ? 'bg-cyan/[0.12] ring-1 ring-inset ring-cyan/50' :
                    slot.endsWith(':00') ? 'bg-white/[0.012]' : ''
                  } ${!isDrop && !isCont ? 'hover:bg-white/[0.015]' : ''}`}>

                  {/* Slots que citas anteriores siguen ocupando — una banda por
                      cita, con el color de cada una, para que se vea cuando son
                      dos pacientes distintos a la misma hora. */}
                  {isCont && !isDrop && contAppts.map(appt => {
                    const s = getEventStyle(appt);
                    return (
                      <div key={appt.id}
                        title={`${appt.patient.firstName} ${appt.patient.lastName} · ${apptTimeRange(appt.scheduledFor, appt.durationMinutes)}`}
                        className="flex-1 min-w-0 rounded flex items-center px-2 border border-dashed"
                        style={{
                          borderColor: s.border,
                          background: 'repeating-linear-gradient(135deg,rgba(255,255,255,0.05) 0 6px,transparent 6px 12px)',
                          textDecoration: s.strike ? 'line-through' : undefined,
                          ...edgeStyle(s),
                        }}>
                        <span className="text-[9.5px] truncate" style={{ color: s.text, opacity: 0.7 }}>
                          ↳ {t('slotContinues', { name: `${appt.patient.firstName} ${appt.patient.lastName}` })}
                        </span>
                      </div>
                    );
                  })}

                  {/* Los avisos van primero: contextualizan la fila antes de que
                      el ojo llegue a la pildora de disponible. La pildora se sigue
                      mostrando a proposito — el aviso NO bloquea, la hora sigue
                      libre y se puede agendar. */}
                  {cellBlocks.map(b => (
                    <div key={b.id} className="flex-1 min-w-0">
                      <BlockCard block={b} providerLabel={b.providerName ?? undefined}
                        onClick={() => { setEditingBlock(b); setBlockDialogOpen(true); }} />
                    </div>
                  ))}

                  {/* Slot libre — la pildora se ve SIEMPRE (no solo en hover):
                      que cada fila tenga la misma caja es lo que hace que la
                      grilla se lea ordenada, igual que v2. */}
                  {cellAppts.length === 0 && !isCont && !slotIsPast(dayKey, slot) && !isDrop && (
                    <div className="flex-1 min-w-0 flex items-center px-2 rounded border border-dashed border-cyan/[0.18] bg-cyan/[0.02] text-cyan/40 group-hover:border-cyan/40 group-hover:bg-cyan/[0.06] group-hover:text-cyan/70 transition-colors">
                      <Plus className="w-2.5 h-2.5 mr-1 shrink-0" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">{t('slotAvailable')}</span>
                      {/* El aviso, con la hora de ESTA fila ya cargada. Aparece al
                          pasar el mouse para no competir con "disponible", que es
                          la lectura principal de la fila. */}
                      <button type="button" title={t('blockNewButton')}
                        onClick={(e) => { e.stopPropagation(); openBlockAt(dayKey, slot); }}
                        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-2 transition-opacity">
                        <CalendarOff className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {cellAppts.map(appt => {
                    const s = getEventStyle(appt);
                    const visitLabel = appt.visitNumber === 0 ? t('visitFirst') : appt.visitNumber > 0 ? t('visitN', { n: appt.visitNumber + 1 }) : '';
                    const drName = appt.provider ? drShort(appt.provider) : '';
                    const timeRange = apptTimeRange(appt.scheduledFor, appt.durationMinutes);
                    const isDragging = draggingId === appt.id;
                    return (
                      <button key={appt.id} type="button"
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDraggingId(appt.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', appt.id); }}
                        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                        onClick={(e) => { e.stopPropagation(); if (!draggingId) setSelectedAppt(appt); }}
                        className={`flex-1 min-w-0 text-left rounded px-2 py-1 transition-all hover:brightness-110 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}
                        style={{ background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow, textDecoration: s.strike ? 'line-through' : undefined, ...edgeStyle(s) }}>
                        <div className="flex items-baseline gap-1 leading-tight">
                          <span className="text-[11px] font-bold truncate flex-1 min-w-0" style={{ color: s.text }}>
                            {appt.patient.firstName} {appt.patient.lastName}
                          </span>
                          {appt.isOnline && (
                            <Video className="w-3.5 h-3.5 shrink-0 text-cyan" aria-label={t('legendOnline')} />
                          )}
                          {s.badge && <span className="text-[13px] leading-none shrink-0">{s.badge}</span>}
                          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: s.text, opacity: 0.85 }}>{timeRange}</span>
                        </div>
                        <div className="text-[9.5px] leading-tight truncate" style={{ color: s.text, opacity: 0.65 }}>
                          {drName}{appt.case?.caseCode && ` · #${appt.case.caseCode.replace('PMC-','')}`}{visitLabel && ` · ${visitLabel}`}
                        </div>
                      </button>
                    );
                  })}

                  {/* "+" para sumar otra cita a la misma hora (como v2) */}
                  {cellAppts.length > 0 && !slotIsPast(dayKey, slot) && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); openSlot(dayKey, slot); }}
                      title={t('slotAddAnother')}
                      className="shrink-0 w-[26px] rounded border border-dashed border-cyan/30 text-cyan/60 flex items-center justify-center transition-colors hover:bg-cyan/10 hover:border-cyan/60 hover:text-cyan">
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Cabecera del día */}
              <div className={`rounded-xl border border-white/[0.07] overflow-hidden mb-3 max-w-[280px] ${isToday ? 'bg-cyan/[0.06]' : 'bg-bg-1'}`}>
                <div className="py-2.5 text-center">
                  <div className={`text-[9px] uppercase tracking-widest font-bold ${isToday ? 'text-cyan' : 'text-text-muted'}`}>
                    {WEEKDAYS_ALL[dowIdx]}
                  </div>
                  <div className={`text-[26px] font-black leading-none mt-0.5 ${isToday ? 'text-cyan' : 'text-text-1'}`}>
                    {dayNum}
                  </div>
                </div>
              </div>

              {/* Dos columnas en desktop · una sola en mobile/tablet (Regla #4) */}
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3">
                {loading && (
                  <div className="absolute inset-0 bg-bg-1/70 flex items-center justify-center z-10 rounded-xl">
                    <Clock className="w-4 h-4 animate-spin text-text-2" />
                  </div>
                )}
                {columns.map((slots, ci) => slots.length > 0 && (
                  <div key={ci} className="rounded-xl border border-white/[0.07] bg-bg-1 overflow-hidden">
                    <div className="grid grid-cols-[58px_1fr] border-b border-white/[0.07] bg-bg-2">
                      <div className="border-r border-white/[0.07] py-1.5 text-center text-[9px] uppercase tracking-widest font-bold text-text-muted">
                        {t('colHour')}
                      </div>
                      <div className="py-1.5 text-center text-[9px] uppercase tracking-widest font-bold text-text-muted">
                        {t('colAppts')}
                      </div>
                    </div>
                    {slots.map(renderSlotRow)}
                  </div>
                ))}
              </div>
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} filterClinic={filterClinic} t={t} />
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
                {/* Day-of-week headers — solo Lun-Vie: la clinica no atiende
                    fines de semana, igual que la vista de semana. */}
                <div className="grid grid-cols-5 border-b border-white/[0.07]">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="py-2.5 text-center border-r border-white/[0.07] last:border-r-0">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-text-muted">{d}</span>
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
                  <div key={wi} className="grid grid-cols-5 border-b border-white/[0.04] last:border-b-0" style={{ minHeight: '96px' }}>
                    {week.slice(0, 5).map((day, di) => {
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
                                style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, boxShadow: appt.visitNumber === 0 ? s.glow : undefined, textDecoration: s.strike ? 'line-through' : undefined, ...edgeStyle(s) }}>
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
              <LegendStats appointments={visibleAppointments} firstVisitCount={firstVisitCount} pendingConfirm={pendingConfirm} filterClinic={filterClinic} t={t} />
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
          coverage={selectedAppt.case?.coverage}
          onOpenCase={openCase}
          suspended={caseModalOpen}
          /* El QR de firma solo en el calendario de la clínica: es un acto del
             MOSTRADOR. `lockedProviderId` solo lo manda el portal médico
             (`/doctor/calendar`), y ahí el paciente ya está adentro. */
          allowSignQr={!lockedProviderId}
          onClose={() => setSelectedAppt(null)}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* ─── Aviso en la agenda ("Lunch", "el doctor no esta") ─ */}
      <TimeBlockDialog
        open={blockDialogOpen}
        editing={editingBlock}
        // `specialty` puede venir null y el combobox la exige: se normaliza acá
        // en vez de aflojar el tipo del primitivo, que lo comparten 4 pantallas.
        providers={providers.map(p => ({ ...p, specialty: p.specialty ?? '' }))}
        defaultProviderId={lockedProviderId ?? filterProvider ?? undefined}
        defaultDate={blockPrefill?.date}
        defaultTime={blockPrefill?.time}
        onClose={() => { setBlockDialogOpen(false); setEditingBlock(null); setBlockPrefill(null); }}
        onSaved={() => setRefreshKey(k => k + 1)}
      />

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
