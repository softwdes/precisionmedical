import { Suspense } from 'react';
import * as React from 'react';
import { api } from '@/lib/trpc/server';
import { EmployeesClient } from '../employees/employees-client';
import { LawyersClient } from '../lawyers/lawyers-client';
import { ProvidersClient } from '../providers/providers-client';
import { AppointmentsClient } from '../appointments/appointments-client';
import { ComunicacionesClient } from './comunicaciones-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Métricas' };

const TABS = [
  { key: 'comunicaciones', label: 'Comunicaciones', href: '/dashboard/metricas?tab=comunicaciones' },
  { key: 'clinicas',       label: 'Clínicas',       href: '/dashboard/metricas' },
  { key: 'empleados',      label: 'Empleados',      href: '/dashboard/metricas?tab=empleados' },
  { key: 'abogados',       label: 'Abogados',       href: '/dashboard/metricas?tab=abogados' },
  { key: 'proveedores',    label: 'Proveedores',    href: '/dashboard/metricas?tab=proveedores' },
  { key: 'citas',          label: 'Citas',          href: '/dashboard/metricas?tab=citas' },
];

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params    = await searchParams;
  const tab       = (params.tab as string) ?? 'comunicaciones';
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'comunicaciones';

  let content: React.ReactElement;

  if (activeTab === 'comunicaciones') {
    const { calls: rawCalls } = await api.metrics.listCalls({ limit: 500 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = rawCalls as any[];

    // Compute KPIs
    const answered  = calls.filter(c => c.outcome === 'ANSWERED').length;
    const noAnswer  = calls.filter(c => c.outcome === 'NO_ANSWER' || c.outcome === 'BUSY').length;
    const outbound  = calls.filter(c => c.direction === 'OUTBOUND').length;
    const inbound   = calls.filter(c => c.direction === 'INBOUND').length;
    const durations = calls.filter(c => c.durationSeconds).map(c => Number(c.durationSeconds));
    const avgDurationSec = durations.length
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;

    const rows = calls.map(c => ({
      id:              c.id as string,
      direction:       c.direction as 'INBOUND' | 'OUTBOUND',
      outcome:         c.outcome as 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IN_PROGRESS',
      fromNumber:      c.fromNumber as string,
      toNumber:        c.toNumber as string,
      durationSeconds: c.durationSeconds as number | null,
      agentName:       c.agentName as string | null,
      patientName:     c.patient
        ? `${(c.patient as { firstName: string }).firstName} ${(c.patient as { lastName: string }).lastName}`
        : null,
      caseCode: (c.case as { caseCode: string } | null)?.caseCode ?? null,
      createdAt: c.createdAt as string,
    }));

    content = (
      <ComunicacionesClient
        calls={rows}
        kpis={{ totalCalls: calls.length, answered, noAnswer, outbound, inbound, avgDurationSec }}
      />
    );
  } else if (activeTab === 'empleados') {
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
