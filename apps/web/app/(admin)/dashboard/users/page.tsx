import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { UsersClient } from './users-client';
import { getCurrentUserRole } from '@/lib/auth/get-role';
import { can } from '@/lib/permissions';

export const metadata = { title: 'Usuarios' };

export default async function UsersPage(): Promise<React.ReactElement> {
  // Get current user role (with permission check)
  const role = await getCurrentUserRole();
  if (!can(role, 'usuarios')) {
    redirect('/no-access');
  }

  // Get current user's auth ID (to disable "own row" in inline role select)
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const [initial] = await Promise.all([
    api.users.list({ page: 1, pageSize: 20 }),
  ]);

  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <UsersClient
        initial={initial}
        currentUserRole={role}
        currentUserId={authUser?.id ?? ''}
      />
    </Suspense>
  );
}
