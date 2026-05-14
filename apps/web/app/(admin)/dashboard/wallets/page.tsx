import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { WalletsClient } from './wallets-client';

export const metadata = { title: 'Wallets' };

export default async function WalletsPage(): Promise<React.ReactElement> {
  const wallets = await api.wallets.list();
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <WalletsClient initialWallets={wallets} />
    </Suspense>
  );
}
