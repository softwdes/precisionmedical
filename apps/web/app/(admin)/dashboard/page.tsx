import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { api } from '@/lib/trpc/server';
import { DashboardClient } from './dashboard-client';
import { SalaryAlertModal } from '@/components/SalaryAlertModal';
import { getCurrentUserRole } from '@/lib/auth/get-role';
import { can } from '@/lib/permissions';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('dashboard.title') };
}

export default async function DashboardPage(): Promise<React.ReactElement> {
  // El middleware solo desvía a `employee` y `contador`; doctores, abogados,
  // proveedores y el auditor llegaban hasta acá. El router ya no les devuelve
  // datos, pero sin este chequeo igual verían el cascarón del dashboard con
  // todo vacío, que parece una falla del sistema en vez de una puerta cerrada.
  // Mismo patrón que usuarios y empleados.
  const role = await getCurrentUserRole();
  if (!can(role, 'dashboard')) {
    redirect('/no-access');
  }

  const [
    kpis,
    activity,
    cashBoxes,
    appointmentsToday,
    patientDistribution,
    systemStatus,
    agentStatus,
    commissionsSummary,
    topReferrers,
  ] = await Promise.allSettled([
    api.dashboard.kpis(),
    api.dashboard.activityFeed(),
    api.dashboard.cashBoxes(),
    api.dashboard.appointmentsToday(),
    api.dashboard.patientDistribution(),
    api.dashboard.systemStatus(),
    api.dashboard.agentStatus(),
    api.dashboard.commissionsSummary(),
    api.dashboard.topReferrers(),
  ]);

  function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    return result.status === 'fulfilled' ? result.value : fallback;
  }

  return (
    <>
      <DashboardClient
        kpis={unwrap(kpis, null)}
        activity={unwrap(activity, [])}
        cashBoxes={unwrap(cashBoxes, [])}
        appointmentsToday={unwrap(appointmentsToday, null)}
        patientDistribution={unwrap(patientDistribution, null)}
        systemStatus={unwrap(systemStatus, null)}
        agentStatus={unwrap(agentStatus, null)}
        commissionsSummary={unwrap(commissionsSummary, null)}
        topReferrers={unwrap(topReferrers, null)}
      />
      <SalaryAlertModal />
    </>
  );
}
