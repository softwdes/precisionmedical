import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: boolean;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  outline: 'btn btn-outline',
  ghost: 'btn btn-ghost',
};

export function Button({ variant = 'primary', icon, children, className, ...props }: ButtonProps) {
  const cls = `${variantClass[variant]}${icon ? ' btn-icon' : ''}${className ? ` ${className}` : ''}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
