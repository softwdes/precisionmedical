import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { FxClient } from './fx-client';

export const metadata = { title: 'FX / Divisas' };

export default async function FxPage(): Promise<React.ReactElement> {
  const [initial, wallets, initialSummary, initialHouses] = await Promise.all([
    api.fx.list({ page: 1, pageSize: 25 }),
    api.wallets.list(),
    api.fx.getSummary({}),
    api.fx.getExchangeHouses(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <FxClient initial={initial} wallets={wallets} initialSummary={initialSummary} initialHouses={initialHouses} />
    </Suspense>
  );
}
