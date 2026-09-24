import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { PaymentsClient } from './payments-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('payments.title') };
}

export default async function PaymentsPage(): Promise<React.ReactElement> {
  const [initial, summary, planillaBolivia] = await Promise.all([
    api.payments.list({ page: 1, pageSize: 25 }),
    api.payments.getSummary({}),
    api.payments.planillaStats({ currency: 'BOB' }),
  ]);

  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <PaymentsClient initial={initial} summary={summary} planillaBolivia={planillaBolivia} />
    </Suspense>
  );
}
