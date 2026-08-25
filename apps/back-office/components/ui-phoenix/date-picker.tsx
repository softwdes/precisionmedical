'use client';

/**
 * DatePicker — selector de fecha con la estética del sistema (reemplaza el
 * popup nativo del browser, que no respeta los tokens).
 *
 * Trigger: botón con la fecha corta + icono. Popover: grid mensual con
 * navegación, día de hoy delineado, seleccionado en el accent del módulo.
 *
 * Uso:
 *   <DatePicker value="2026-07-28" onChange={(k) => ...} accent="violet" todayLabel={t('today')} />
 *
 * `value`/`onChange` trabajan con claves YYYY-MM-DD (sin timezone — el caller
 * decide qué significa el día, ej. Denver).
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DatePickerProps {
  /** YYYY-MM-DD seleccionado */
  value: string;
  onChange: (dateKey: string) => void;
  /** Color de identidad del módulo (Regla #5) */
  accent?: 'violet' | 'emerald' | 'cyan' | 'brand' | 'amber';
  /** Label del botón "Hoy" del popover (viene del namespace del caller) */
  todayLabel?: string;
  /** YYYY-MM-DD que cuenta como "hoy" (default: fecha local del dispositivo) */
  todayKey?: string;
  /** Clases extra para el botón trigger */
  className?: string;
  /**
   * Tamaño del trigger: sm (h-7, toolbars) · lg (h-10, táctil/iPad) ·
   * inline (texto pelado dentro de una celda de tabla).
   *
   * `inline` existe para la grilla de tracking, donde la fila mide ~20px: un
   * boton con borde y alto propio la estiraria. Se ve como el resto del texto
   * de la celda y solo se delata al pasar el mouse, igual que los otros
   * editores en celda.
   */
  size?: 'sm' | 'lg' | 'inline';
  /** Qué mostrar cuando `value` viene vacío (solo `inline`). */
  placeholder?: string;
  /**
   * Formato del label del trigger:
   *  · short   "28 jul 2026"
   *  · long    "lunes, 28 de julio de 2026"
   *  · numeric "28/07/2026" — el que usa la clínica en los formularios: leen
   *    los números, no el nombre del mes (Erick 2026-08-08).
   */
  labelFormat?: 'short' | 'long' | 'numeric';
  /**
   * Por defecto, si el valor es HOY el botón dice "Hoy/Today" — sirve en las
   * barras de navegación por día. En un FORMULARIO confunde: el usuario espera
   * ver la fecha que va a quedar registrada. Con esto siempre se muestra la
   * fecha.
   */
  alwaysShowDate?: boolean;
}

const ACCENTS: Record<NonNullable<DatePickerProps['accent']>, { solid: string; ring: string; text: string }> = {
  violet:  { solid: 'linear-gradient(135deg,#7C3AED,#A78BFA)', ring: 'ring-violet/50',  text: 'text-violet-text'  },
  emerald: { solid: 'linear-gradient(135deg,#059669,#34D399)', ring: 'ring-emerald/50', text: 'text-emerald' },
  cyan:    { solid: 'linear-gradient(135deg,#0891B2,#22D3EE)', ring: 'ring-cyan/50',    text: 'text-cyan'    },
  brand:   { solid: 'linear-gradient(135deg,#4F46E5,#818CF8)', ring: 'ring-brand/50',   text: 'text-brand-text'   },
  amber:   { solid: 'linear-gradient(135deg,#D97706,#FBBF24)', ring: 'ring-amber/50',   text: 'text-amber'   },
};

const pad = (n: number): string => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;

function localTodayKey(): string {
  const n = new Date();
  return keyOf(n.getFullYear(), n.getMonth(), n.getDate());
}

export function DatePicker({ value, onChange, accent = 'brand', todayLabel = 'Hoy', todayKey, className = '', size = 'sm', labelFormat = 'short', alwaysShowDate = false, placeholder = '—' }: DatePickerProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  /**
   * El calendario se renderiza en un PORTAL con `position: fixed`.
   *
   * Dentro de un diálogo el cuerpo scrollea (`overflow-y-auto`) y un popover
   * `absolute` queda RECORTADO — se veía medio calendario. Además el
   * `transform` del DialogContent haría de bloque contenedor de cualquier
   * `fixed` hijo (ver memoria: css-fixed-inside-dialog-trap), así que el
   * portal a `body` es la única salida. Mismo patrón que ui-phoenix/autocomplete.
   */
  const [popStyle, setPopStyle] = React.useState<React.CSSProperties>({ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' });
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const POP_W = 248;
  const POP_H = 300; // alto aproximado del popover (header + grid + pie)

  React.useLayoutEffect(() => {
    if (!open) return;
    const compute = (): void => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Alineado a la derecha del trigger, sin salirse de la ventana
      const left = Math.max(8, Math.min(r.right - POP_W, window.innerWidth - POP_W - 8));
      // Abre hacia arriba si abajo no entra
      const abreArriba = r.bottom + POP_H > window.innerHeight && r.top > POP_H;
      setPopStyle(abreArriba
        ? { position: 'fixed', bottom: window.innerHeight - r.top + 4, left, visibility: 'visible' }
        : { position: 'fixed', top: r.bottom + 4, left, visibility: 'visible' });
    };
    compute();
    // Seguir al contenedor scrolleable del diálogo
    let scrollable: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (scrollable) {
      const oy = window.getComputedStyle(scrollable).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      scrollable = scrollable.parentElement;
    }
    scrollable?.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      scrollable?.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [open]);
  const a = ACCENTS[accent];
  const today = todayKey ?? localTodayKey();

  // Mes visible (año, mes 0-11) — arranca en el mes del value
  const [vy, vm] = React.useMemo(() => {
    const m = /^(\d{4})-(\d{2})/.exec(value);
    return m ? [parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1] : [new Date().getFullYear(), new Date().getMonth()];
  }, [value]);
  const [view, setView] = React.useState<{ y: number; m: number }>({ y: vy, m: vm });
  React.useEffect(() => { setView({ y: vy, m: vm }); }, [vy, vm]);

  // Cerrar con click fuera / Escape
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // El popover vive en un portal: hay que mirar los DOS árboles
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(view.y, view.m, 15));
  // Semana empieza en lunes (igual que el calendario B.10)
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)), // 2024-01-01 = lunes
  );

  // Grid del mes: 42 celdas desde el lunes de la primera semana
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // días del mes anterior visibles
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(view.y, view.m, 1 - lead + i);
    return { key: keyOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === view.m };
  });

  // Viendo el día actual → label "Hoy/Today" en el color del módulo (patrón Day
  // Admission). En formularios se pide `alwaysShowDate` y siempre va la fecha.
  const isTodayValue = value === today;
  const dateOpts: Intl.DateTimeFormatOptions =
    labelFormat === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : labelFormat === 'numeric'
        ? { day: '2-digit', month: '2-digit', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  // Sin valor no hay nada que formatear: `new Date('T12:00:00')` es Invalid Date
  // y el trigger salia con "Invalid Date" escrito.
  const triggerLabel = !value
    ? placeholder
    : isTodayValue && !alwaysShowDate
      ? todayLabel
      : new Intl.DateTimeFormat(locale, dateOpts).format(new Date(`${value}T12:00:00`));

  const pick = (k: string): void => { onChange(k); setOpen(false); };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          size === 'lg'
            ? `h-10 rounded-lg border border-border bg-bg-1 px-4 text-sm font-semibold hover:bg-white/5 transition-colors flex items-center gap-2 capitalize ${isTodayValue ? a.text : 'text-text-1'}`
            : size === 'inline'
              ? `w-full text-left rounded-[3px] px-1 -mx-1 whitespace-nowrap hover:bg-brand/10 hover:ring-1 hover:ring-brand/30 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer ${value ? 'text-text-2' : 'text-text-muted'}`
              : `h-7 rounded border border-border bg-bg-1 px-2.5 text-[12px] hover:bg-white/5 transition-colors flex items-center gap-1.5 ${isTodayValue ? `${a.text} font-semibold` : 'text-text-1'}`
        }
      >
        {/* En la celda no entra el icono: la fila mide ~20px y la columna es angosta. */}
        {size !== 'inline' && (
          <CalendarDays className={`${size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${a.text}`} />
        )}
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div ref={popRef} style={popStyle} className="z-[9999] w-[248px] rounded-lg border border-border bg-bg-1 shadow-2xl p-3">
          {/* Header: mes + navegación */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
              className="w-6 h-6 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[12px] font-semibold text-text-1 capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
              className="w-6 h-6 rounded border border-border hover:bg-white/5 text-text-2 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 mb-1">
            {weekdays.map((w, i) => (
              <span key={i} className="text-center text-[9px] uppercase font-semibold text-text-muted py-0.5">{w}</span>
            ))}
          </div>

          {/* Días */}
          <div className="grid grid-cols-7 gap-[2px]">
            {cells.map((c) => {
              const isSel = c.key === value;
              const isToday = c.key === today;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c.key)}
                  className={[
                    'h-7 rounded text-[11px] tabular-nums transition-colors flex items-center justify-center',
                    isSel ? 'text-white font-bold' : c.inMonth ? 'text-text-1 hover:bg-white/5' : 'text-text-muted hover:bg-white/5',
                    !isSel && isToday ? `ring-1 ${a.ring} ${a.text} font-semibold` : '',
                  ].join(' ')}
                  style={isSel ? { background: a.solid } : undefined}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={() => pick(today)}
              className={`text-[11px] font-semibold ${a.text} hover:underline`}
            >
              {todayLabel}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
