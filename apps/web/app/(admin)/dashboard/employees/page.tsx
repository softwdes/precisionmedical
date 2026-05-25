import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';
import { PaymentsClient } from '../payments/payments-client';
import { FreelancersClient } from './freelancers-client';
import { HorariosClient } from './horarios-client';
import { AsistenciaClient } from './asistencia-client';
import { ReporteHorasClient } from './reporte-horas-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Empleados' };

const TABS = [
  { key: 'lista',       label: 'Empleados',          href: '/dashboard/employees' },
  { key: 'freelancers', label: 'Freelancers',         href: '/dashboard/employees?tab=freelancers' },
  { key: 'pagos',       label: 'Pagos de Salarios',   href: '/dashboard/employees?tab=pagos' },
  { key: 'horarios',    label: 'Horarios',             href: '/dashboard/employees?tab=horarios' },
  { key: 'asistencia',  label: 'Asistencia',           href: '/dashboard/employees?tab=asistencia' },
  { key: 'reporte',     label: 'Reporte de Horas',    href: '/dashboard/employees?tab=reporte' },
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
    const employees = await api.employees.list({ page: 1, pageSize: 100 });
    content = <HorariosClient initialEmployees={employees.items} />;
  } else if (activeTab === 'asistencia') {
    content = <AsistenciaClient />;
  } else if (activeTab === 'reporte') {
    let empOptions: Array<{ id: string; firstName: string; lastName: string; employeeCode: string }> = [];
    try {
      const employees = await api.employees.list({ page: 1, pageSize: 200 });
      empOptions = employees.items.map((e) => ({
        id: e.id,
        firstName: e.firstName as string,
        lastName: e.lastName as string,
        employeeCode: e.employeeCode as string,
      }));
    } catch (err) {
      console.error('[ReporteHoras] employees.list failed:', err);
    }
    content = <ReporteHorasClient initialEmployees={empOptions} />;
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
