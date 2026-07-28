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
  /** Tamaño del trigger: sm (h-7, toolbars) · lg (h-10, táctil/iPad) */
  size?: 'sm' | 'lg';
  /** Formato del label del trigger: short "28 jul 2026" · long "lunes, 28 de julio de 2026" */
  labelFormat?: 'short' | 'long';
}

const ACCENTS: Record<NonNullable<DatePickerProps['accent']>, { solid: string; ring: string; text: string }> = {
  violet:  { solid: 'linear-gradient(135deg,#7C3AED,#A78BFA)', ring: 'ring-violet/50',  text: 'text-violet'  },
  emerald: { solid: 'linear-gradient(135deg,#059669,#34D399)', ring: 'ring-emerald/50', text: 'text-emerald' },
  cyan:    { solid: 'linear-gradient(135deg,#0891B2,#22D3EE)', ring: 'ring-cyan/50',    text: 'text-cyan'    },
  brand:   { solid: 'linear-gradient(135deg,#4F46E5,#818CF8)', ring: 'ring-brand/50',   text: 'text-brand'   },
  amber:   { solid: 'linear-gradient(135deg,#D97706,#FBBF24)', ring: 'ring-amber/50',   text: 'text-amber'   },
};

const pad = (n: number): string => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;

function localTodayKey(): string {
  const n = new Date();
  return keyOf(n.getFullYear(), n.getMonth(), n.getDate());
}

export function DatePicker({ value, onChange, accent = 'brand', todayLabel = 'Hoy', todayKey, className = '', size = 'sm', labelFormat = 'short' }: DatePickerProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
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
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  const triggerLabel = new Intl.DateTimeFormat(
    locale,
    labelFormat === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(new Date(`${value}T12:00:00`));

  const pick = (k: string): void => { onChange(k); setOpen(false); };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          size === 'lg'
            ? 'h-10 rounded-lg border border-border bg-bg-1 px-4 text-sm font-semibold text-text-1 hover:bg-white/5 transition-colors flex items-center gap-2 capitalize'
            : 'h-7 rounded border border-border bg-bg-1 px-2.5 text-[12px] text-text-1 hover:bg-white/5 transition-colors flex items-center gap-1.5'
        }
      >
        <CalendarDays className={`${size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${a.text}`} />
        {triggerLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[248px] rounded-lg border border-border bg-bg-1 shadow-2xl p-3">
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
                    isSel ? 'text-white font-bold' : c.inMonth ? 'text-text-1 hover:bg-white/5' : 'text-text-muted/50 hover:bg-white/5',
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
        </div>
      )}
    </div>
  );
}
