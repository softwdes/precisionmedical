import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { PettyCashClient } from './petty-cash-client';

export const metadata = { title: 'Caja Chica' };

export default async function PettyCashPage(): Promise<React.ReactElement> {
  const [boxes, kpis] = await Promise.all([
    api.pettyCash.listBoxes(),
    api.pettyCash.kpis(),
  ]);
  return <PettyCashClient initialBoxes={boxes} initialKpis={kpis} />;
}
