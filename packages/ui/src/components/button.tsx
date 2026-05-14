import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-semibold text-sm transition-all duration-250 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-brand text-white shadow-glow hover:bg-brand/90 hover:shadow-glow active:scale-[0.98]',
        secondary:
          'bg-surface border border-border-strong text-text-1 hover:bg-surface-2 active:scale-[0.98]',
        ghost:
          'text-text-2 hover:bg-surface hover:text-text-1 active:scale-[0.98]',
        destructive:
          'bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20 active:scale-[0.98]',
        outline:
          'border border-border-strong bg-transparent text-text-1 hover:bg-surface active:scale-[0.98]',
        link: 'text-brand underline-offset-4 hover:underline p-0 h-auto',
        icon: 'bg-surface border border-border text-text-2 hover:bg-surface-2 hover:text-text-1 hover:border-border-strong',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-sm px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        xl: 'h-12 rounded-lg px-8 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
        'icon-lg': 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled ?? loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
