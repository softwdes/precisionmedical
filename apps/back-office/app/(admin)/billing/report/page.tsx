import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportClient } from './report-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('billingReport') };
}

export default function BillingReportPage() {
  return <ReportClient />;
}
