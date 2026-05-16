import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from '../employees/employees-client';
import { LawyersClient } from '../lawyers/lawyers-client';
import { ProvidersClient } from '../providers/providers-client';
import { AppointmentsClient } from '../appointments/appointments-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Métricas' };

const TABS = [
  { key: 'clinicas',    label: 'Clínicas',    href: '/dashboard/metricas' },
  { key: 'empleados',   label: 'Empleados',   href: '/dashboard/metricas?tab=empleados' },
  { key: 'abogados',    label: 'Abogados',    href: '/dashboard/metricas?tab=abogados' },
  { key: 'proveedores', label: 'Proveedores', href: '/dashboard/metricas?tab=proveedores' },
  { key: 'citas',       label: 'Citas',       href: '/dashboard/metricas?tab=citas' },
];

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const tab = (params.tab as string) ?? 'clinicas';
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'clinicas';

  let content: React.ReactElement;

  if (activeTab === 'empleados') {
    const [initial, departments] = await Promise.all([
      api.employees.list({ page: 1, pageSize: 25 }),
      api.departments.list(),
    ]);
    content = <EmployeesClient initial={initial} departments={departments} />;
  } else if (activeTab === 'abogados') {
    const initial = await api.lawyers.list();
    content = <LawyersClient initial={initial} />;
  } else if (activeTab === 'proveedores') {
    const initial = await api.providers.list();
    content = <ProvidersClient initial={initial} />;
  } else if (activeTab === 'citas') {
    const [initial, clinics, patients, providers] = await Promise.all([
      api.appointments.list(),
      api.appointments.listClinics(),
      api.patients.list(),
      api.providers.list(),
    ]);
    content = (
      <AppointmentsClient
        initial={initial}
        clinics={clinics}
        patients={patients.items}
        providers={providers.items}
      />
    );
  } else {
    content = (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-text-3 text-sm">Estadísticas de clínicas — próximamente</p>
        </div>
      </div>
    );
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
