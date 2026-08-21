import { getTranslations } from 'next-intl/server';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { PettyCashClient } from './petty-cash-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('pettyCash.title') };
}

export default async function PettyCashPage(): Promise<React.ReactElement> {
  const [boxes, kpis] = await Promise.all([
    api.pettyCash.listBoxes(),
    api.pettyCash.kpis(),
  ]);
  return <PettyCashClient initialBoxes={boxes} initialKpis={kpis} />;
}
