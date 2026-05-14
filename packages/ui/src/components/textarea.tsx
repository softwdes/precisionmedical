import * as React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded border border-border bg-surface px-3 py-2 text-small text-text-1 placeholder:text-text-muted transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:cursor-not-allowed disabled:opacity-50 resize-none',
        error && 'border-rose focus:ring-rose',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
