export * from './Button';
export * from './Card';
export * from './KPICard';
export * from './Sidebar';
export * from './Topbar';
export * from './AppLayout';
export { clsx, type ClassValue } from 'clsx';
export { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
