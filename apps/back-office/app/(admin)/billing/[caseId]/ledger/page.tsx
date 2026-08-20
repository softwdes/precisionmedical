import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LedgerClient } from './ledger-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('ledger') };
}

export default function LedgerPage() {
  return <LedgerClient />;
}
