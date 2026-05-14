import { Suspense } from 'react';
import { api } from '@/lib/trpc/server';
import { MetricsClient } from './metrics-client';

export const metadata = { title: 'Métricas' };

export default async function MetricsPage(): Promise<React.ReactElement> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [snapshots, departments] = await Promise.all([
    api.metrics.list({ month: currentMonth }),
    api.departments.list(),
  ]);
  return (
    <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
      <MetricsClient initialSnapshots={snapshots} departments={departments} currentMonth={currentMonth} />
    </Suspense>
  );
}
