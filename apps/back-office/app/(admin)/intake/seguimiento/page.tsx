import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SeguimientoClient } from './seguimiento-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('followUp') };
}

export default function SeguimientoPage() {
  return <SeguimientoClient />;
}
