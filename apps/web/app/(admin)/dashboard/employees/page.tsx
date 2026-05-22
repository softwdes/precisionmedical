import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';
import { PaymentsClient } from '../payments/payments-client';
import { FreelancersClient } from './freelancers-client';
import { HorariosClient } from './horarios-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Empleados' };

const TABS = [
  { key: 'lista',       label: 'Empleados',          href: '/dashboard/employees' },
  { key: 'freelancers', label: 'Freelancers',         href: '/dashboard/employees?tab=freelancers' },
  { key: 'pagos',       label: 'Pagos de Salarios',   href: '/dashboard/employees?tab=pagos' },
  { key: 'horarios',    label: 'Horarios',             href: '/dashboard/employees?tab=horarios' },
  { key: 'asistencia',  label: 'Asistencia',           href: '/dashboard/employees?tab=asistencia' },
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
  } else if (activeTab === 'horarios') {
    const employees = await api.employees.list({ page: 1, pageSize: 200 });
    content = <HorariosClient initialEmployees={employees.items} />;
  } else if (activeTab === 'asistencia') {
    content = (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-border">
          <svg className="h-7 w-7 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-text-1">Asistencia</p>
          <p className="text-[12.5px] text-text-3 mt-1">Disponible cuando PM Time Clock esté conectado</p>
        </div>
        <span className="rounded-full border border-border bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Próximamente</span>
      </div>
    );
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
