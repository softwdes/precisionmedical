import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HcfaClient } from './hcfa-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('hcfa') };
}

export default function HcfaPage() {
  return <HcfaClient />;
}
