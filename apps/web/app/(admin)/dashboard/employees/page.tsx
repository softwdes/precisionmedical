import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';
import { PaymentsClient } from '../payments/payments-client';
import { FreelancersClient } from './freelancers-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Empleados' };

const TABS = [
  { key: 'lista',       label: 'Empleados',          href: '/dashboard/employees' },
  { key: 'freelancers', label: 'Freelancers',        href: '/dashboard/employees?tab=freelancers' },
  { key: 'pagos',       label: 'Pagos de Salarios',  href: '/dashboard/employees?tab=pagos' },
];

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params    = await searchParams;
  const tab       = (params.tab as string) ?? 'lista';
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'lista';

  let content: React.ReactElement;

  if (activeTab === 'pagos') {
    const [initial, summary] = await Promise.all([
      api.payments.list({ page: 1, pageSize: 25 }),
      api.payments.getSummary({}),
    ]);
    content = <PaymentsClient initial={initial} summary={summary} />;
  } else if (activeTab === 'freelancers') {
    const [initial, initialSummary] = await Promise.all([
      api.freelancers.list({ page: 1, pageSize: 25 }),
      api.freelancers.getSummary(),
    ]);
    content = <FreelancersClient initial={initial} initialSummary={initialSummary} />;
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
