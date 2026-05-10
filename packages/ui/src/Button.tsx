/**
 * Button Component
 * 
 * Canonical button implementation for LM Super Admin.
 * Use this pattern for all buttons in the app.
 * 
 * Variants: primary, secondary, ghost, icon
 * Sizes: sm, md, lg
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)] hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(99,102,241,0.45)]',
        secondary:
          'bg-white/[0.04] border border-border text-text-1 hover:bg-brand/10 hover:border-brand/25 hover:-translate-y-px',
        ghost:
          'text-text-2 hover:text-text-1 hover:bg-white/[0.04]',
        icon:
          'bg-white/[0.03] border border-border text-text-2 hover:text-text-1 hover:bg-white/[0.06] hover:border-border-strong',
        destructive:
          'bg-rose/10 border border-rose/30 text-rose hover:bg-rose/15',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-lg',
        md: 'h-9.5 px-4 text-[12.5px] rounded-[10px]',
        lg: 'h-11 px-6 text-sm rounded-[12px]',
        icon: 'h-9.5 w-9.5 rounded-[10px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

/**
 * Usage examples:
 * 
 * <Button>Save changes</Button>
 * <Button variant="secondary">Cancel</Button>
 * <Button variant="ghost" size="sm">View all</Button>
 * <Button variant="icon" size="icon"><BellIcon size={17} /></Button>
 * <Button loading>Saving...</Button>
 * <Button asChild><Link href="/dashboard">Go home</Link></Button>
 */
