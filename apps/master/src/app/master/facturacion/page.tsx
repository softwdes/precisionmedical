import { getAdminContext } from '@/lib/supabase-server';
import { getBillingHistory, getBillingMetrics } from '@/actions/master';
import FacturacionTable from '@/components/master/FacturacionTable';
import MasterUserMenu from '@/components/MasterUserMenu';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function FacturacionPage() {
  try {
    await getAdminContext();
  } catch {
    redirect('/login');
  }

  const [rawRows, metrics] = await Promise.all([getBillingHistory(), getBillingMetrics()]);

  const rows = rawRows.map((r: any) => ({
    id: r.id,
    trainer_name: (r.trainers as any)?.business_name ?? '—',
    plan_nombre: (r.planes_saas as any)?.nombre ?? '—',
    monto: Number(r.monto),
    fecha_pago: r.fecha_pago,
    periodo: r.periodo,
    estado: r.estado as 'pagado' | 'pendiente' | 'vencido',
    metodo_pago: r.metodo_pago ?? null,
  }));

  const periodos = [...new Set(rows.map((r: any) => r.periodo as string))].sort().reverse();

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          Master <span className="sep">//</span> <span className="crumb-active">Facturación</span>
        </div>
        <div className="topbar-right">
          <MasterUserMenu />
        </div>
      </header>

      <section className="section-head">
        <span className="eyebrow">Finanzas // 04</span>
        <h1>Facturación</h1>
      </section>

      <FacturacionTable rows={rows} metrics={metrics} periodos={periodos} />
    </>
  );
}
