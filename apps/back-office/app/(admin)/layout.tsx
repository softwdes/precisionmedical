import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';

// Phoenix · Back Office · Admin layout
// Phase 1A: sin auth (vendrá con Supabase wire en Phase 1B).
// Mobile-responsive shell con drawer sidebar + i18n EN/ES.

export default function AdminLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <AdminShell>{children}</AdminShell>;
}
