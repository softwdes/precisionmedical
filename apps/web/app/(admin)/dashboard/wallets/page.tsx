import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { WalletsClient } from './wallets-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('wallets.title') };
}

export default async function WalletsPage(): Promise<React.ReactElement> {
  const wallets = await api.wallets.list();
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <WalletsClient initialWallets={wallets} />
    </Suspense>
  );
}
