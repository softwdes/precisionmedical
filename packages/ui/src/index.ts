export * from './Button';
export * from './Card';
export * from './KPICard';
export { clsx, type ClassValue } from 'clsx';
export { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
