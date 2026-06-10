import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';

// Back-Office · Admin layout
// Server Component — obtiene sesión de Supabase y pasa nombre/rol al shell.
// Si no hay sesión (middleware la redirecciona primero, pero por si acaso):

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN:       'Admin',
  CONTADOR:    'Contador',
  EMPLOYEE:    'Empleado',
  PROVIDER:    'Proveedor',
  LAWYER:      'Abogado',
  AUDITOR_AI:  'Auditor IA',
};

function initials(first: string, last: string): string {
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  // Obtener usuario autenticado
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Obtener nombre y rol desde la tabla users
  let userName    = user.email ?? 'Usuario';
  let userRole    = '';
  let userInits   = 'U';

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('firstName, lastName, role')
      .eq('email', user.email ?? '')
      .single();

    if (data) {
      userName  = `${data.firstName} ${data.lastName}`.trim();
      userRole  = ROLE_LABELS[data.role as string] ?? data.role;
      userInits = initials(data.firstName ?? '', data.lastName ?? '');
    }
  } catch {
    // Si falla la consulta, usar email como fallback
  }

  return (
    <>
      <UpdateBanner />
      <AdminShell
        userName={userName}
        userRole={userRole}
        userInitials={userInits}
        userEmail={user.email ?? ''}
      >
        {children}
      </AdminShell>
    </>
  );
}
