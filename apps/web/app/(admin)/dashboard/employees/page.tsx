import { Suspense } from 'react';
import * as React from 'react';
import { redirect } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from './employees-client';
import { PaymentsClient } from '../payments/payments-client';
import { FreelancersClient } from './freelancers-client';
import { HorariosClient } from './horarios-client';
import { AsistenciaClient } from './asistencia-client';
import { ReporteHorasClient } from './reporte-horas-client';
import { ModuleTabs } from '@/components/module-tabs';
import { getCurrentUserRole } from '@/lib/auth/get-role';
import { getPermission, can } from '@/lib/permissions';

const ALL_TABS = [
  { key: 'lista',       label: 'Empleados',          href: '/dashboard/employees' },
  { key: 'freelancers', label: 'Freelancers',         href: '/dashboard/employees?tab=freelancers' },
  { key: 'pagos',       label: 'Pago de Salarios',    href: '/dashboard/employees?tab=pagos' },
  { key: 'horarios',    label: 'Horarios',             href: '/dashboard/employees?tab=horarios' },
  { key: 'asistencia',  label: 'Asistencia',           href: '/dashboard/employees?tab=asistencia' },
  { key: 'reporte',     label: 'Reporte de Horas',    href: '/dashboard/employees?tab=reporte' },
];

// Tabs visible when empleados = 'payroll_only'
const PAYROLL_TABS = ['asistencia', 'reporte'];

export const metadata = { title: 'Empleados' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const role = await getCurrentUserRole();
  const empPerm = getPermission(role, 'empleados');

  // No access → redirect
  if (!can(role, 'empleados')) {
    redirect('/no-access');
  }

  // Filter tabs based on permission level
  const TABS = empPerm === 'payroll_only'
    ? ALL_TABS.filter(t => PAYROLL_TABS.includes(t.key))
    : ALL_TABS;

  const params    = await searchParams;
  const tab       = (params.tab as string) ?? (empPerm === 'payroll_only' ? 'asistencia' : 'lista');
  const activeTab = TABS.some(t => t.key === tab) ? tab : TABS[0]?.key ?? 'lista';

  let content: React.ReactElement;

  if (activeTab === 'pagos' && empPerm !== 'payroll_only') {
    const [initial, summary] = await Promise.all([
      api.payments.list({ page: 1, pageSize: 25 }),
      api.payments.getSummary({}),
    ]);
    content = <PaymentsClient initial={initial} summary={summary} />;
  } else if (activeTab === 'freelancers' && empPerm !== 'payroll_only') {
    const [initial, initialSummary] = await Promise.all([
      api.freelancers.list({ page: 1, pageSize: 25 }),
      api.freelancers.getSummary(),
    ]);
    content = <FreelancersClient initial={initial} initialSummary={initialSummary} />;
  } else if (activeTab === 'horarios' && empPerm !== 'payroll_only') {
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
