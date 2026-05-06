import Link from 'next/link';
import { getAllTrainers, getGlobalMetrics, getRecentPayments, recordSubscriptionPayment } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const [trainers, metrics, recentPayments] = await Promise.all([
    getAllTrainers(),
    getGlobalMetrics(),
    getRecentPayments(10),
  ]);

  const activeCount = trainers.filter((t: any) => t.subscription_status === 'active').length;
  const trialingCount = trainers.filter((t: any) => t.subscription_status === 'trialing').length;
  const expiringCount = trainers.filter((t: any) => {
    if (!t.subscription_expires_at || t.subscription_status !== 'active') return false;
    const days = Math.ceil((new Date(t.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 15 && days > 0;
  }).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Neural <span style={{ color: 'var(--accent)' }}>Trainer</span></div>
            <div className="brand-tag">Master</div>
          </div>
        </div>

        <nav className="nav">
          <Link href="/" className="nav-item">Dashboard</Link>
          <Link href="/trainers" className="nav-item">Trainers</Link>
          <Link href="/suscripciones" className="nav-item active">Suscripciones</Link>
          <Link href="/auditoria" className="nav-item">Auditoría</Link>
          <Link href="/soporte" className="nav-item">Soporte</Link>
        </nav>

        <div className="system-status">
          <div className="system-status-title">Plataforma</div>
          <div className="system-status-row"><span>Trainers</span><span className="val">{metrics.total_trainers}</span></div>
          <div className="system-status-row"><span>Ingresos</span><span className="val">S/ {metrics.monthly_revenue}</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Suscripciones</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <div className="user-chip">
              <div>
                <div className="user-name">Admin</div>
                <div className="user-role">SaaS Master</div>
              </div>
              <span className="user-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              </span>
            </div>
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Gestión // 01</span>
            <h1>Suscripciones y Facturación</h1>
          </section>

          <section className="metrics-row">
            <div className="metric">
              <div className="label-caps">Ingresos Mensuales</div>
              <div className="metric-row">
                <span className="metric-value">S/ {metrics.monthly_revenue.toLocaleString()}</span>
                <span className="metric-delta">PEN</span>
              </div>
              <div className="metric-bar"><span style={{ width: '70%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Suscripciones Activas</div>
              <div className="metric-row">
                <span className="metric-value">{activeCount}</span>
                <span className="metric-delta">{Math.round(activeCount / (trainers.length || 1) * 100)}%</span>
              </div>
              <div className="metric-bar"><span style={{ width: `${(activeCount / (trainers.length || 1)) * 100}%` }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Por Vencer (15 días)</div>
              <div className="metric-row">
                <span className="metric-value">{expiringCount}</span>
                <span className="metric-delta">Renovar</span>
              </div>
              <div className="metric-bar"><span style={{ width: `${(expiringCount / 20) * 100}%` }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">En Trial</div>
              <div className="metric-row">
                <span className="metric-value">{trialingCount}</span>
                <span className="metric-delta">Pendiente</span>
              </div>
              <div className="metric-bar"><span style={{ width: `${(trialingCount / 10) * 100}%` }} /></div>
            </div>
          </section>

          <div className="grid grid-2">
            <section className="card">
              <div className="card-head">
                <div className="card-head-left">
                  <span className="eyebrow">Gestión // 02</span>
                  <h2>Suscripciones por Vencer</h2>
                </div>
              </div>
              <div className="agenda">
                {trainers.filter((t: any) => {
                  if (!t.subscription_expires_at) return false;
                  const days = Math.ceil((new Date(t.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return days <= 15 && days > 0 && t.subscription_status === 'active';
                }).map((trainer: any) => {
                  const days = Math.ceil((new Date(trainer.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={trainer.id} className="agenda-row">
                      <div className="agenda-time">{days} días</div>
                      <div className="agenda-info">
                        <div className="agenda-diagnosis">RENOVAR</div>
                        <div className="agenda-patient">{trainer.business_name}</div>
                      </div>
                      <button className="btn btn-outline">Recordar</button>
                    </div>
                  );
                })}
                {trainers.filter((t: any) => {
                  if (!t.subscription_expires_at) return false;
                  const days = Math.ceil((new Date(t.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return days <= 15 && days > 0 && t.subscription_status === 'active';
                }).length === 0 && (
                  <div className="empty-state">No hay suscripciones por vencer</div>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-head-left">
                  <span className="eyebrow">Gestión // 03</span>
                  <h2>Registrar Pago</h2>
                </div>
              </div>
              <div className="card-body card-body--padded">
                <form action={recordSubscriptionPayment} className="form-stack">
                  <div className="form-group">
                    <label className="label">Trainer</label>
                    <select name="trainer_id" className="select" required>
                      <option value="">Seleccionar...</option>
                      {trainers.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.business_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="label">Monto (PEN)</label>
                      <input type="number" name="amount" className="input" defaultValue="299" required />
                    </div>
                    <div className="form-group">
                      <label className="label">Período</label>
                      <select name="period_months" className="select">
                        <option value="1">1 mes</option>
                        <option value="12">12 meses</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary">Registrar Pago</button>
                </form>
              </div>
            </section>
          </div>

          <section className="card" style={{ marginTop: 'var(--space-6)' }}>
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Historial de Pagos Recientes</div>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trainer</th>
                    <th>Monto</th>
                    <th>Período</th>
                    <th>Fecha de Pago</th>
                    <th>Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                        No hay pagos registrados
                      </td>
                    </tr>
                  ) : (
                    recentPayments.map((payment: any) => (
                      <tr key={payment.id}>
                        <td>{payment.trainer?.business_name || '-'}</td>
                        <td className="text-mint">S/ {payment.amount.toLocaleString()}</td>
                        <td className="text-muted">
                          {new Date(payment.period_start).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}
                          {' — '}
                          {new Date(payment.period_end).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="text-muted">
                          {new Date(payment.paid_on).toLocaleDateString('es-PE')}
                        </td>
                        <td><button className="btn btn-ghost">Descargar</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}