import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';
import { PaymentsClient } from '../payments/payments-client';
import { MetricsClient } from '../metrics/metrics-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Empleados' };

const TABS = [
  { key: 'lista',    label: 'Lista',    href: '/dashboard/employees' },
  { key: 'pagos',    label: 'Pagos',    href: '/dashboard/employees?tab=pagos' },
  { key: 'metricas', label: 'Métricas', href: '/dashboard/employees?tab=metricas' },
];

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const tab = (params.tab as string) ?? 'lista';
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'lista';

  let content: React.ReactElement;

  if (activeTab === 'pagos') {
    const [initial, summary] = await Promise.all([
      api.payments.list({ page: 1, pageSize: 25 }),
      api.payments.getSummary({}),
    ]);
    content = <PaymentsClient initial={initial} summary={summary} />;
  } else if (activeTab === 'metricas') {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const [snapshots, departments] = await Promise.all([
      api.metrics.list({ month: currentMonth }),
      api.departments.list(),
    ]);
    content = <MetricsClient initialSnapshots={snapshots} departments={departments} currentMonth={currentMonth} />;
  } else {
    const [initial, departments] = await Promise.all([
      api.employees.list({ page: 1, pageSize: 25 }),
      api.departments.list(),
    ]);
    content = <EmployeesClient initial={initial} departments={departments} />;
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
