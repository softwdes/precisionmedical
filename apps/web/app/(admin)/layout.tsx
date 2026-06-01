import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { AppLayout } from '@/components/layout/app-layout';
import { BootAnimation } from '@/components/layout/boot-animation';
import { SessionGuard } from '@/components/layout/session-guard';
import { dbRoleToRole } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  CONTADOR: 'Contador',
  EMPLOYEE: 'Empleado',
  LAWYER: 'Abogado',
  PROVIDER: 'Proveedor',
  AUDITOR_AI: 'IA Auditor',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect('/login');
  }

  const adminClient = createAdminClient();
  const { data: user, error } = await adminClient
    .from('users')
    .select('id, firstName, lastName, avatarUrl, role')
    .eq('email', supabaseUser.email!)
    .single();

  if (error || !user) {
    redirect('/api/auth/signout');
  }

  const role: Role = dbRoleToRole(user.role as string);

  return (
    <BootAnimation>
      {/* Auto-logout after 12h of session lifetime → /login?expired=true */}
      <SessionGuard maxAgeHours={12} />
      <AppLayout
        userName={`${user.firstName} ${user.lastName}`}
        userRole={ROLE_LABELS[user.role as string] ?? user.role}
        userEmail={supabaseUser.email ?? ''}
        avatarUrl={user.avatarUrl ?? undefined}
        role={role}
        userId={supabaseUser.id}
      >
        {children}
      </AppLayout>
    </BootAnimation>
  );
}
