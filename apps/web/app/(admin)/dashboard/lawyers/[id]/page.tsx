import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { LawyerDetailClient } from './lawyer-detail-client';

interface Props { params: Promise<{ id: string }> }

export default async function LawyerDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations();

  try {
    const lawyer = await api.lawyers.getById({ id });
    return <LawyerDetailClient lawyer={lawyer} />;
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations();
  try {
    const lawyer = await api.lawyers.getById({ id });
    const name = lawyer.entityType === 'FIRM'
      ? (lawyer.firmName ?? t('lawyers.title'))
      : [lawyer.firstName, lawyer.lastName].filter(Boolean).join(' ') || t('lawyers.title');
    return { title: name };
  } catch {
    return { title: t('lawyers.title') };
  }
}
