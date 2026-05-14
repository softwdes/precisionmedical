import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { AppLayout } from '@/components/layout/app-layout';
import { BootAnimation } from '@/components/layout/boot-animation';

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
    // Sign out before redirecting to avoid redirect loop
    redirect('/api/auth/signout');
  }

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    EMPLOYEE: 'Employee',
    LAWYER: 'Lawyer',
    PROVIDER: 'Provider',
    AUDITOR_AI: 'AI Auditor',
  };

  return (
    <BootAnimation>
      <AppLayout
        userName={`${user.firstName} ${user.lastName}`}
        userRole={roleLabels[user.role] ?? user.role}
        userEmail={supabaseUser.email ?? ''}
        avatarUrl={user.avatarUrl ?? undefined}
      >
        {children}
      </AppLayout>
    </BootAnimation>
  );
}
