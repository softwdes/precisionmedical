import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettlementClient } from './settlement-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('settlement') };
}

export default function SettlementPage() {
  return <SettlementClient />;
}
