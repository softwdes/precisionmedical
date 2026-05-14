import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { FxClient } from './fx-client';

export const metadata = { title: 'FX / Divisas' };

export default async function FxPage(): Promise<React.ReactElement> {
  const [initial, wallets] = await Promise.all([
    api.fx.list({ page: 1, pageSize: 25 }),
    api.wallets.list(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <FxClient initial={initial} wallets={wallets} />
    </Suspense>
  );
}
