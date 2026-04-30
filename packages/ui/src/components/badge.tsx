import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'accent' | 'mint-soft' | 'danger';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'badge',
  accent: 'badge badge-accent',
  'mint-soft': 'badge badge-mint-soft',
  danger: 'badge badge-danger',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return <span className={variantClass[variant]}>{children}</span>;
}
