import { getAdminContext } from '@/lib/supabase-server';
import { getReporteMetrics } from '@/actions/master';
import MasterUserMenu from '@/components/MasterUserMenu';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const V = '#534AB7';

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="metric">
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value" style={{ color: accent ?? 'var(--fg-strong)' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

export default async function ReportesPage() {
  try {
    await getAdminContext();
  } catch {
    redirect('/login');
  }

  const m = await getReporteMetrics();

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          Master <span className="sep">//</span> <span className="crumb-active">Reportes</span>
        </div>
        <div className="topbar-right">
          <MasterUserMenu />
        </div>
      </header>

      <section className="section-head">
        <span className="eyebrow">Análisis // 05</span>
        <h1>Reportes</h1>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Business KPIs */}
        <div>
          <div className="label-caps" style={{ marginBottom: '14px' }}>KPIs de negocio</div>
          <section className="metrics-row">
            <StatCard label="Conversión trial" value={`${m.conversion_trial}%`} sub="Trials → Activos" accent="#3FF8C8" />
            <StatCard label="Churn rate" value={`${m.churn_rate}%`} sub="Este mes" accent="#f87171" />
            <StatCard label="LTV promedio" value={`$${m.ltv_promedio.toLocaleString()}`} sub="Por trainer · 12 meses" accent={V} />
            <StatCard label="Ticket promedio" value={`$${m.ticket_promedio.toLocaleString()}`} sub="Por trainer / mes" />
          </section>
        </div>

        {/* Financial */}
        <div>
          <div className="label-caps" style={{ marginBottom: '14px' }}>Financiero</div>
          <section className="metrics-row">
            <StatCard label="ARR proyectado" value={`$${m.arr_proyectado.toLocaleString()}`} sub="Ingresos anuales" accent="#3FF8C8" />
            <StatCard label="NPS estimado" value={m.nps_estimado} sub="Net Promoter Score" accent={V} />
            <StatCard label="Total alumnos" value={m.total_alumnos} sub="Activos en plataforma" />
            <StatCard label="Rutinas este mes" value={m.rutinas_mes} sub="Asignadas" />
          </section>
        </div>

        {/* Platform activity */}
        <div className="card">
          <div className="label-caps" style={{ marginBottom: '16px' }}>Actividad de plataforma — hoy</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Consultas IA', value: m.ia_consultas_hoy, color: V },
              { label: 'Clases', value: m.clases_hoy, color: '#3FF8C8' },
              { label: 'WhatsApp enviados', value: m.whatsapp_enviados, color: '#60A5FA' },
              { label: 'Uptime', value: `${m.uptime}%`, color: '#3FF8C8' },
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px', padding: '16px',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: item.color, marginTop: '8px' }}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System health */}
        <div className="card">
          <div className="label-caps" style={{ marginBottom: '16px' }}>Salud del sistema</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'API Supabase', status: 'Operacional', ok: true },
              { label: 'OpenRouter IA', status: 'Operacional', ok: true },
              { label: 'Edge Functions', status: 'Operacional', ok: true },
              { label: 'Uptime 30d', status: `${m.uptime}%`, ok: m.uptime > 99 },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: '13px' }}>{item.label}</span>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                  background: item.ok ? 'rgba(63,248,200,0.12)' : 'rgba(248,113,113,0.12)',
                  color: item.ok ? '#3FF8C8' : '#f87171',
                }}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
