import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { PettyCashClient } from '../petty-cash/petty-cash-client';
import { FxClient } from '../fx/fx-client';
import { WalletsClient } from '../wallets/wallets-client';
import { CashBoxesClient } from './cash-boxes-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Finanzas' };

const TABS = [
  { key: 'caja-chica', label: 'Caja Chica',  href: '/dashboard/finanzas' },
  { key: 'cajas',      label: 'Gestionar cajas', href: '/dashboard/finanzas?tab=cajas' },
  { key: 'fx',         label: 'FX / Divisas',    href: '/dashboard/finanzas?tab=fx' },
  { key: 'wallets',    label: 'Wallets',         href: '/dashboard/finanzas?tab=wallets' },
];

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const tab = (params.tab as string) ?? 'caja-chica';
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'caja-chica';

  let content: React.ReactElement;

  if (activeTab === 'cajas') {
    content = <CashBoxesClient />;
  } else if (activeTab === 'fx') {
    // El cliente filtra por el mes actual por defecto. El fetch inicial debe
    // usar el MISMO período, si no `initialData` trae operaciones de todos los
    // meses y al refetchear (con filtro de mes) desaparecen las que no son del
    // mes actual → bug "aparecen dos, desaparece una".
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [initial, wallets, initialSummary, initialHouses] = await Promise.all([
      api.fx.list({ page: 1, pageSize: 25, period: currentPeriod }),
      api.wallets.list(),
      api.fx.getSummary({ period: currentPeriod }),
      api.fx.getExchangeHouses(),
    ]);
    content = <FxClient initial={initial} wallets={wallets} initialSummary={initialSummary} initialHouses={initialHouses} />;
  } else if (activeTab === 'wallets') {
    const wallets = await api.wallets.list();
    content = <WalletsClient initialWallets={wallets} />;
  } else {
    const [boxes, kpis] = await Promise.all([
      api.pettyCash.listBoxes(),
      api.pettyCash.kpis(),
    ]);
    content = <PettyCashClient initialBoxes={boxes} initialKpis={kpis} />;
  }

  return (
    <>
      <ModuleTabs tabs={TABS} activeTab={activeTab} />
      <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
        {content}
      </Suspense>
    </>
  );
}
