'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';

const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthPickerProps {
  /** 'YYYY-MM' o '' para vacío */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel?: string;
  todayLabel?: string;
  locale?: 'es' | 'en';
  className?: string;
}

export function MonthPicker({
  value,
  onChange,
  placeholder = 'Seleccionar mes',
  clearLabel = 'Borrar',
  todayLabel = 'Este mes',
  locale = 'es',
  className,
}: MonthPickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const now = React.useMemo(() => new Date(), []);
  const [year, monthIdx] = value ? value.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const [viewYear, setViewYear] = React.useState(year ?? now.getFullYear());

  React.useEffect(() => {
    if (open) setViewYear(year ?? now.getFullYear());
  }, [open, year, now]);

  const labels = locale === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_ES;

  const displayLabel = value
    ? `${labels[(monthIdx ?? 1) - 1]}. ${year}`
    : placeholder;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-2 rounded border border-border bg-surface px-3 text-small transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand',
            value ? 'text-text-1' : 'text-text-muted',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
          {displayLabel}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-56 rounded border border-border bg-surface p-3 shadow-lg data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-1 hover:text-text-1 transition-colors"
              aria-label="Año anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-small font-semibold text-text-1 tabular-nums">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-1 hover:text-text-1 transition-colors"
              aria-label="Año siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {labels.map((label, i) => {
              const m = i + 1;
              const isSelected = value === `${viewYear}-${String(m).padStart(2, '0')}`;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onChange(`${viewYear}-${String(m).padStart(2, '0')}`);
                    setOpen(false);
                  }}
                  className={cn(
                    'rounded px-2 py-1.5 text-small transition-colors',
                    isSelected
                      ? 'bg-brand text-white font-semibold'
                      : 'text-text-2 hover:bg-bg-1 hover:text-text-1',
                  )}
                >
                  {label}.
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border text-tiny">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-text-3 hover:text-text-1 transition-colors"
            >
              {clearLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                const y = now.getFullYear();
                const m = now.getMonth() + 1;
                onChange(`${y}-${String(m).padStart(2, '0')}`);
                setOpen(false);
              }}
              className="text-brand hover:text-brand/80 transition-colors font-medium"
            >
              {todayLabel}
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
