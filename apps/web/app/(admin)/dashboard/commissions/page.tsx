import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { CommissionsClient } from './commissions-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('commissions.title') };
}

export default async function CommissionsPage() {
  const [initial, lawyers, providers, patients] = await Promise.all([
    api.commissions.list(),
    api.lawyers.list(),
    api.providers.list(),
    api.patients.list(),
  ]);
  return (
    <CommissionsClient
      initial={initial}
      lawyers={lawyers.items}
      providers={providers.items}
      patients={patients.items}
    />
  );
}
