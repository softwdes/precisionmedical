import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SeguimientoDetailClient } from './detail-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('followUpDetail') };
}

export default function SeguimientoDetailPage() {
  return <SeguimientoDetailClient />;
}
