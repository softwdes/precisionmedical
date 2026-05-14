import { api } from '@/lib/trpc/server';
import { PettyCashClient } from './petty-cash-client';

export const metadata = { title: 'Caja Chica' };

export default async function PettyCashPage(): Promise<React.ReactElement> {
  const boxes = await api.pettyCash.listBoxes();
  return <PettyCashClient initialBoxes={boxes} />;
}
