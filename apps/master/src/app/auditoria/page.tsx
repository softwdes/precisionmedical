import Link from 'next/link';
import { getActivityLog } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const logs = await getActivityLog(50);

  const actionColors: Record<string, string> = {
    login: 'badge-accent',
    create: 'badge-mint-soft',
    update: 'badge',
    delete: 'badge-danger',
    payment: 'badge-warning',
  };

  const entityLabels: Record<string, string> = {
    trainer: 'Trainer',
    student: 'Alumno',
    routine: 'Rutina',
    booking: 'Reserva',
    subscription: 'Suscripción',
    payment: 'Pago',
    message: 'Mensaje',
  };

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
          <Link href="/master/trainers" className="nav-item">Trainers</Link>
          <Link href="/master/suscripciones" className="nav-item">Suscripciones</Link>
          <Link href="/master/auditoria" className="nav-item active">Auditoría</Link>
          <Link href="/master/soporte" className="nav-item">Soporte</Link>
        </nav>

        <div className="system-status">
          <div className="system-status-title">Registros</div>
          <div className="system-status-row"><span>Total</span><span className="val">{logs.length}</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Auditoría</span>
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
            <span className="eyebrow">Plataforma // 01</span>
            <h1>Log de Actividad</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="row">
              <input type="text" className="input" placeholder="Buscar actividad..." style={{ width: '300px' }} />
              <select className="select" style={{ width: '180px' }}>
                <option value="">Todos los actores</option>
                <option value="master">Master</option>
                <option value="trainer">Trainer</option>
                <option value="student">Alumno</option>
              </select>
              <select className="select" style={{ width: '180px' }}>
                <option value="">Todas las entidades</option>
                <option value="trainer">Trainer</option>
                <option value="student">Alumno</option>
                <option value="routine">Rutina</option>
                <option value="booking">Reserva</option>
              </select>
            </div>
            <button className="btn btn-outline">Exportar CSV</button>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Historial de Actividad</div>
                <div className="card-subtitle">Últimas 50 acciones</div>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha/Hora</th>
                    <th>Actor</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>ID</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                        No hay registros de actividad
                      </td>
                    </tr>
                  ) : (
                    logs.map((log: any) => (
                      <tr key={log.id}>
                        <td className="text-muted">
                          {new Date(log.created_at).toLocaleString('es-PE', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td>
                          <span className={`badge ${log.actor_role === 'master' ? 'badge-accent' : log.actor_role === 'trainer' ? 'badge-mint-soft' : 'badge'}`}>
                            {log.actor_role?.toUpperCase() || 'Sistema'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${actionColors[log.action.split('_')[0]] || 'badge'}`}>
                            {log.action.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="text-muted">
                          {entityLabels[log.entity] || log.entity || '-'}
                        </td>
                        <td className="mono text-muted">
                          {log.entity_id ? log.entity_id.slice(0, 8) : '-'}
                        </td>
                        <td className="text-muted">
                          {log.metadata ? JSON.stringify(log.metadata).substring(0, 50) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pagination">
            <button className="btn btn-outline" disabled>Anterior</button>
            <span className="page-info">Página 1 de 1</span>
            <button className="btn btn-outline" disabled>Siguiente</button>
          </div>
        </div>
      </main>
    </div>
  );
}