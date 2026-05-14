import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { PatientsClient } from './patients-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('patients.title') };
}

export default async function PatientsPage() {
  const [initial, lawyers, providers] = await Promise.all([
    api.patients.list(),
    api.lawyers.list(),
    api.providers.list(),
  ]);
  return <PatientsClient initial={initial} lawyers={lawyers.items} providers={providers.items} />;
}
