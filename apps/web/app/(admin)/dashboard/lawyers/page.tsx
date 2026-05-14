import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { LawyersClient } from './lawyers-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('lawyers.title') };
}

export default async function LawyersPage() {
  const initial = await api.lawyers.list();
  return <LawyersClient initial={initial} />;
}
