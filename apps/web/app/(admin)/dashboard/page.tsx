import { api } from '@/lib/trpc/server';
import { DashboardClient } from './dashboard-client';
// SalaryAlertModal removido temporalmente — causaba React error #418
// (hydration mismatch). Bell badge + notifications drawer siguen
// funcionando como capa de alerta. Restaurar cuando se identifique
// la causa raiz del mismatch.

export const metadata = { title: 'Dashboard — Precision Medical' };

export default async function DashboardPage(): Promise<React.ReactElement> {
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
  );
}
