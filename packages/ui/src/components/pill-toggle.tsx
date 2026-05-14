'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

interface PillOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface PillToggleProps<T extends string> {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

function PillToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: PillToggleProps<T>): React.ReactElement {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill border border-border bg-surface p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-pill px-3 py-1 text-small font-semibold transition-all duration-250 ease-out-expo',
            value === option.value
              ? 'bg-brand text-white shadow-soft'
              : 'text-text-3 hover:text-text-2',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { PillToggle };
export type { PillOption };
