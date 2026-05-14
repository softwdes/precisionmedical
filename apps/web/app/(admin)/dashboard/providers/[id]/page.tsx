import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { ProviderDetailClient } from './provider-detail-client';

interface Props { params: Promise<{ id: string }> }

export default async function ProviderDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const provider = await api.providers.getById({ id });
    return <ProviderDetailClient provider={provider} />;
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations();
  try {
    const provider = await api.providers.getById({ id });
    return { title: `${provider.firstName} ${provider.lastName}` };
  } catch {
    return { title: t('providers.title') };
  }
}
