import Link from 'next/link';
import { getAllTrainers, getGlobalMetrics } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function TrainersPage() {
  const trainers = await getAllTrainers();
  const metrics = await getGlobalMetrics();

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
            <div className="brand-name">Precision</div>
            <div className="brand-tag">Master Panel</div>
          </div>
        </div>

        <nav className="nav">
          <Link href="/master" className="nav-item">Dashboard</Link>
          <Link href="/master/trainers" className="nav-item active">Trainers</Link>
          <Link href="/master/suscripciones" className="nav-item">Suscripciones</Link>
          <Link href="/master/auditoria" className="nav-item">Auditoría</Link>
          <Link href="/master/soporte" className="nav-item">Soporte</Link>
        </nav>

        <div className="system-status">
          <div className="system-status-title">Plataforma</div>
          <div className="system-status-row"><span>Trainers</span><span className="val">{metrics.total_trainers}</span></div>
          <div className="system-status-row"><span>Alumnos</span><span className="val">{metrics.total_students}</span></div>
          <div className="system-status-row"><span>Uptime</span><span className="val accent">99.9%</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Trainers</span>
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
            <h1>Gestión de Trainers</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="row">
              <input type="text" className="input" placeholder="Buscar trainer..." style={{ width: '300px' }} />
              <select className="select" style={{ width: '180px' }}>
                <option value="">Todos los estados</option>
                <option value="active">Activo</option>
                <option value="trialing">Trial</option>
                <option value="past_due">Pendiente</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <button className="btn btn-primary">+ Nuevo Trainer</button>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Directorio de Trainers</div>
                <div className="card-subtitle">{trainers.length} trainers registrados</div>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trainer</th>
                    <th>Slug</th>
                    <th>Especialidades</th>
                    <th>Estado</th>
                    <th>Alumnos</th>
                    <th>Vencimiento</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {trainers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                        No hay trainers registrados
                      </td>
                    </tr>
                  ) : (
                    trainers.map((trainer: any) => {
                      const statusColors: Record<string, string> = {
                        active: 'badge-accent',
                        trialing: 'badge-mint-soft',
                        past_due: 'badge-warning',
                        suspended: 'badge-danger',
                      };
                      
                      const daysUntilExpiry = trainer.subscription_expires_at 
                        ? Math.ceil((new Date(trainer.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <tr key={trainer.id}>
                          <td>
                            <div className="trainer-cell">
                              <span className="trainer-name">{trainer.business_name}</span>
                              <span className="trainer-email">{trainer.slug}@precisiontrainer.app</span>
                            </div>
                          </td>
                          <td className="mono">{trainer.slug}</td>
                          <td className="text-muted">
                            {trainer.specialities?.join(', ') || '-'}
                          </td>
                          <td>
                            <span className={`badge ${statusColors[trainer.subscription_status] || 'badge'}`}>
                              {trainer.subscription_status === 'active' ? 'Activo' : 
                               trainer.subscription_status === 'trialing' ? 'Trial' :
                               trainer.subscription_status === 'past_due' ? 'Pendiente' : 'Suspendido'}
                            </span>
                          </td>
                          <td className="text-muted">-</td>
                          <td>
                            {daysUntilExpiry !== null && (
                              <span className={daysUntilExpiry <= 15 ? 'text-warning' : 'text-muted'}>
                                {daysUntilExpiry > 0 ? `${daysUntilExpiry} días` : 'Vencido'}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 'var(--space-2)' }}>
                              <Link href={`/master/trainers/${trainer.id}`} className="btn btn-ghost btn-icon" title="Ver detalle">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </Link>
                              <Link href={`/master/trainers/${trainer.id}/editar`} className="btn btn-ghost btn-icon" title="Editar">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}