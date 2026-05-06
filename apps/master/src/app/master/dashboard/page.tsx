import { getAdminContext } from '@/lib/supabase-server';
import {
  getMasterMetrics, getMrrHistory, getPlanDistribution,
  getTopTrainers, getRecentActivity, getAlertBanners,
} from '@/actions/master';
import MasterDashboard from '@/components/master/MasterDashboard';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let adminId = '';
  let adminEmail = '';
  try {
    const ctx = await getAdminContext();
    adminId = ctx.adminId;
    adminEmail = ctx.email;
  } catch {
    redirect('/login');
  }

  const [metrics, mrrHistory, planDistribution, topTrainers, recentActivity, alerts] =
    await Promise.all([
      getMasterMetrics(),
      getMrrHistory(),
      getPlanDistribution(),
      getTopTrainers(5),
      getRecentActivity(8),
      getAlertBanners(),
    ]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          Master <span className="sep">//</span> <span className="crumb-active">Dashboard</span>
        </div>
        <div className="topbar-right">
          <div className="live-indicator">En Vivo</div>
          <div className="user-chip">
            <div>
              <div className="user-name">Super Admin</div>
              <div className="user-role">SaaS Master</div>
            </div>
          </div>
        </div>
      </header>

      <section className="section-head">
        <span className="eyebrow">Plataforma // 01</span>
        <h1>Dashboard SaaS</h1>
      </section>

      <MasterDashboard
        metrics={metrics}
        mrrHistory={mrrHistory}
        planDistribution={planDistribution}
        topTrainers={topTrainers}
        recentActivity={recentActivity}
        alerts={alerts}
        adminId={adminId}
        adminEmail={adminEmail}
      />
    </>
  );
}
