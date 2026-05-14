import { api } from '@/lib/trpc/server';
import { DashboardClient } from './dashboard-client';

export const metadata = { title: 'Dashboard — Precision Medical' };

export default async function DashboardPage(): Promise<React.ReactElement> {
  try {
    const [kpis, activity, cashBoxes] = await Promise.all([
      api.dashboard.kpis(),
      api.dashboard.activityFeed(),
      api.dashboard.cashBoxes(),
    ]);
    return <DashboardClient kpis={kpis} activity={activity} cashBoxes={cashBoxes} />;
  } catch {
    return <DashboardClient kpis={null} activity={[]} cashBoxes={[]} />;
  }
}
