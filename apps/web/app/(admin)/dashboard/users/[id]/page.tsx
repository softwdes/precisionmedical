import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { UserDetailClient } from './user-detail-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const user = await api.users.getById({ id }).catch(() => null);
  return { title: user ? `${user.firstName} ${user.lastName}` : t('users.title') };
}

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
