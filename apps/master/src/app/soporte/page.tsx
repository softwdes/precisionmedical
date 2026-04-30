import Link from 'next/link';
import { getSupportTickets } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const allTickets = await getSupportTickets();
  const openTickets = allTickets.filter((t: any) => t.status === 'open').length;
  const inProgressTickets = allTickets.filter((t: any) => t.status === 'in_progress').length;

  const priorityColors: Record<string, string> = {
    low: 'badge',
    normal: 'badge-mint-soft',
    high: 'badge-warning',
    urgent: 'badge-danger',
  };

  const statusLabels: Record<string, string> = {
    open: 'Abierto',
    in_progress: 'En Progreso',
    closed: 'Cerrado',
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
          <Link href="/master/auditoria" className="nav-item">Auditoría</Link>
          <Link href="/master/soporte" className="nav-item active">Soporte</Link>
        </nav>

        <div className="system-status">
          <div className="system-status-title">Tickets</div>
          <div className="system-status-row"><span>Abiertos</span><span className="val accent">{openTickets}</span></div>
          <div className="system-status-row"><span>En Progreso</span><span className="val">{inProgressTickets}</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Soporte</span>
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
            <h1>Sistema de Soporte</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="row">
              <select className="select" style={{ width: '180px' }}>
                <option value="all">Todos los estados</option>
                <option value="open">Abiertos</option>
                <option value="in_progress">En Progreso</option>
                <option value="closed">Cerrados</option>
              </select>
            </div>
          </div>

          <div className="tickets-list">
            {allTickets.length === 0 ? (
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--fg-muted)' }}>
                  No hay tickets de soporte
                </div>
              </div>
            ) : (
              allTickets.map((ticket: any) => (
                <div key={ticket.id} className="ticket-card">
                  <div className="ticket-header">
                    <div className="ticket-id">#{ticket.id.slice(0, 8)}</div>
                    <span className={`badge ${priorityColors[ticket.priority]}`}>
                      {ticket.priority === 'urgent' ? 'Urgente' : 
                       ticket.priority === 'high' ? 'Alto' : 
                       ticket.priority === 'normal' ? 'Normal' : 'Bajo'}
                    </span>
                    <span className={`badge ${ticket.status === 'open' ? 'badge-accent' : ticket.status === 'in_progress' ? 'badge-mint-soft' : 'badge'}`}>
                      {statusLabels[ticket.status]}
                    </span>
                  </div>
                  <div className="ticket-subject">{ticket.subject}</div>
                  <div className="ticket-meta">
                    <span className="trainer-ref">
                      {ticket.trainer?.business_name || 'Trainer ID: ' + ticket.trainer_id}
                    </span>
                    <span className="ticket-date">
                      {new Date(ticket.created_at).toLocaleDateString('es-PE', { 
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div className="ticket-body">
                    {ticket.body.substring(0, 150)}{ticket.body.length > 150 ? '...' : ''}
                  </div>
                  <div className="ticket-actions">
                    <form action={`/api/master/tickets/${ticket.id}`} method="POST">
                      <input type="hidden" name="status" value={ticket.status === 'open' ? 'in_progress' : 'closed'} />
                      <button type="submit" className="btn btn-outline">
                        {ticket.status === 'open' ? 'Tomar Ticket' : 
                         ticket.status === 'in_progress' ? 'Cerrar' : 'Reabrir'}
                      </button>
                    </form>
                    <button className="btn btn-ghost">Ver Completo</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}