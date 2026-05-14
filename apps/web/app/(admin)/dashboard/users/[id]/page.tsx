import * as React from 'react';
import { notFound } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { UserDetailClient } from './user-detail-client';

export const metadata = { title: 'Detalle Usuario' };

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const user = await api.users.getById({ id }).catch(() => null);
  if (!user) notFound();
  return <UserDetailClient user={user} />;
}
