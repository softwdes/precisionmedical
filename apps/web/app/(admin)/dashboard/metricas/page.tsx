import { Suspense } from 'react';
import * as React from 'react';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { api } from '@/lib/trpc/server';
import { LawyersClient } from '../lawyers/lawyers-client';
import { ProvidersClient } from '../providers/providers-client';
import { AppointmentsClient } from '../appointments/appointments-client';
import { ComunicacionesClient } from './comunicaciones-client';
import { EmpleadosMetricasClient } from './empleados-metricas-client';
import { DoctoresMetricasClient } from './doctores-metricas-client';
import { ModuleTabs } from '@/components/module-tabs';

export const metadata = { title: 'Métricas' };

const TABS = [
  { key: 'comunicaciones', label: 'Comunicaciones', href: '/dashboard/metricas?tab=comunicaciones' },
  { key: 'clinicas',       label: 'Clínicas',       href: '/dashboard/metricas' },
  { key: 'empleados',      label: 'Empleados',      href: '/dashboard/metricas?tab=empleados' },
  // 'doctores' se inserta acá solo para SUPER_ADMIN/ADMIN (decisión de Erick 2026-08-07)
  { key: 'abogados',       label: 'Abogados',       href: '/dashboard/metricas?tab=abogados' },
  { key: 'proveedores',    label: 'Proveedores',    href: '/dashboard/metricas?tab=proveedores' },
  { key: 'citas',          label: 'Citas',          href: '/dashboard/metricas?tab=citas' },
];

const DOCTORES_TAB = { key: 'doctores', label: 'Doctores', href: '/dashboard/metricas?tab=doctores' };

/** El tab Doctores es supervisión clínica: solo SUPER_ADMIN / ADMIN lo ven. */
async function isMetricsAdmin(): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { data } = await createAdminClient()
    .from('users')
    .select('role')
    .eq('email', user.email)
    .single();
  return data?.role === 'SUPER_ADMIN' || data?.role === 'ADMIN';
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params  = await searchParams;
  const isAdmin = await isMetricsAdmin();

  // El tab Doctores va después de Empleados, solo para SUPER_ADMIN/ADMIN
  const tabs = isAdmin
    ? [...TABS.slice(0, 3), DOCTORES_TAB, ...TABS.slice(3)]
    : TABS;

  const tab       = (params.tab as string) ?? 'comunicaciones';
  const activeTab = tabs.some(t => t.key === tab) ? tab : 'comunicaciones';

  let content: React.ReactElement;

  if (activeTab === 'comunicaciones') {
    const { calls: rawCalls } = await api.metrics.listCalls({ limit: 500 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = rawCalls as any[];

    // Compute KPIs
    const answered  = calls.filter(c => c.outcome === 'ANSWERED').length;
    const noAnswer  = calls.filter(c => c.outcome === 'NO_ANSWER' || c.outcome === 'BUSY').length;
    const outbound  = calls.filter(c => c.direction === 'OUTBOUND').length;
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
        kpis={{ totalCalls: calls.length, answered, noAnswer, outbound, avgDurationSec }}
      />
    );
  } else if (activeTab === 'empleados') {
    // Productividad por empleado — la data viene de la DB de Clinic vía tRPC
    // (api.metrics.employeeActivity); el cliente maneja el período.
    content = <EmpleadosMetricasClient />;
  } else if (activeTab === 'doctores') {
    // Productividad clínica por doctor con drill-down a cada consulta.
    content = <DoctoresMetricasClient />;
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
      <ModuleTabs tabs={tabs} activeTab={activeTab} />
      <Suspense fallback={<div className="p-6 text-text-3">Cargando...</div>}>
        {content}
      </Suspense>
    </>
  );
}
