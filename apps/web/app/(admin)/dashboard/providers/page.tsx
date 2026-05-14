import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { ProvidersClient } from './providers-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('providers.title') };
}

export default async function ProvidersPage() {
  const initial = await api.providers.list();
  return <ProvidersClient initial={initial} />;
}
