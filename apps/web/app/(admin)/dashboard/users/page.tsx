import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { UsersClient } from './users-client';

export const metadata = { title: 'Usuarios' };

export default async function UsersPage(): Promise<React.ReactElement> {
  const initial = await api.users.list({ page: 1, pageSize: 20 });

  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <UsersClient initial={initial} />
    </Suspense>
  );
}
