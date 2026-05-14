import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-tiny font-bold uppercase tracking-wider transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-brand/15 text-brand border border-brand/20',
        success: 'bg-emerald/15 text-emerald border border-emerald/20',
        warning: 'bg-amber/15 text-amber border border-amber/20',
        destructive: 'bg-rose/15 text-rose border border-rose/20',
        info: 'bg-cyan/15 text-cyan border border-cyan/20',
        secondary: 'bg-surface-2 text-text-2 border border-border',
        outline: 'border border-border-strong text-text-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
