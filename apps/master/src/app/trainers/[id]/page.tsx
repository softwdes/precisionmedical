import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTrainerDetails, updateTrainerModules } from '../../../actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TrainerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const trainer = await getTrainerDetails(id);

  if (!trainer) {
    notFound();
  }

  const defaultModules = {
    students: true,
    routines: true,
    calendar: true,
    messages: true,
    metrics: true,
    payments: false,
    ai_coach: false,
    white_label: false,
  };

  const enabledModules = trainer.enabled_modules || defaultModules;
  const moduleOptions = [
    { key: 'students', label: 'Alumnos', description: 'Gestión de alumnos' },
    { key: 'routines', label: 'Rutinas', description: 'Creación de rutinas' },
    { key: 'calendar', label: 'Calendario', description: 'Horarios y reservas' },
    { key: 'messages', label: 'Mensajería', description: 'Chat con alumnos' },
    { key: 'metrics', label: 'Métricas', description: 'Seguimiento de progreso' },
    { key: 'payments', label: 'Pagos', description: 'Gestión de paquetes' },
    { key: 'ai_coach', label: 'IA Coach', description: 'Asistente de IA' },
    { key: 'white_label', label: 'White Label', description: 'Personalización de marca' },
  ];

  const statusColors: Record<string, string> = {
    active: 'badge-mint-soft',
    trial: 'badge-accent',
    expired: 'badge-danger',
    paused: 'badge-warning',
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
            <div className="brand-name">Neural <span style={{ color: 'var(--accent)' }}>Trainer</span></div>
            <div className="brand-tag">Master</div>
          </div>
        </div>

        <nav className="nav">
          <Link href="/" className="nav-item">Dashboard</Link>
          <Link href="/trainers" className="nav-item active">Trainers</Link>
          <Link href="/suscripciones" className="nav-item">Suscripciones</Link>
          <Link href="/auditoria" className="nav-item">Auditoría</Link>
          <Link href="/soporte" className="nav-item">Soporte</Link>
        </nav>

        <div className="system-status">
          <div className="system-status-title">Trainer</div>
          <div className="system-status-row"><span>ID</span><span className="val mono">{trainer.id.slice(0, 8)}</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> 
            <Link href="/trainers" className="crumb">Trainers</Link> <span className="sep">/</span> 
            <span className="crumb-active">{trainer.business_name}</span>
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
            <span className="eyebrow">Trainer // {trainer.id.slice(0, 8)}</span>
            <h1>{trainer.business_name}</h1>
          </section>

          <div className="row" style={{ gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card-head">
                <div className="card-title">Información</div>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">Slug</span>
                    <span className="detail-value mono">{trainer.slug}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{trainer.email}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Teléfono</span>
                    <span className="detail-value">{trainer.phone || '-'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Creado</span>
                    <span className="detail-value">
                      {new Date(trainer.created_at).toLocaleDateString('es-PE')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ flex: 1 }}>
              <div className="card-head">
                <div className="card-title">Suscripción</div>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">Estado</span>
                    <span className={`badge ${statusColors[trainer.subscription_status] || 'badge'}`}>
                      {trainer.subscription_status === 'active' ? 'Activo' :
                       trainer.subscription_status === 'trial' ? 'Prueba' :
                       trainer.subscription_status === 'expired' ? 'Expirado' :
                       trainer.subscription_status === 'paused' ? 'Pausado' : 'Sin info'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Expira</span>
                    <span className="detail-value">
                      {trainer.subscription_expires_at 
                        ? new Date(trainer.subscription_expires_at).toLocaleDateString('es-PE')
                        : '-'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Alumnos</span>
                    <span className="detail-value accent">{trainer.students_count}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Archivos</span>
                    <span className="detail-value">{trainer.storage_files}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Módulos Habilitados</div>
                <div className="card-subtitle">Configuración por trainer</div>
              </div>
            </div>
            <div className="card-body">
              <form action={async (formData) => {
                'use server';
                const modules: Record<string, boolean> = {};
                moduleOptions.forEach(opt => {
                  modules[opt.key] = formData.get(opt.key) === 'on';
                });
                await updateTrainerModules(id, modules);
              }}>
                <div className="modules-grid">
                  {moduleOptions.map((mod) => (
                    <label key={mod.key} className="module-toggle">
                      <input 
                        type="checkbox" 
                        name={mod.key}
                        defaultChecked={enabledModules[mod.key as keyof typeof enabledModules] ?? false}
                      />
                      <div className="module-toggle-content">
                        <div className="module-toggle-label">{mod.label}</div>
                        <div className="module-toggle-desc">{mod.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <button type="submit" className="btn btn-primary">Guardar Módulos</button>
                </div>
              </form>
            </div>
          </div>

          {trainer.recent_payments && trainer.recent_payments.length > 0 && (
            <div className="card" style={{ marginTop: 'var(--space-6)' }}>
              <div className="card-head">
                <div className="card-title">Pagos Recientes</div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainer.recent_payments.map((payment: any) => (
                      <tr key={payment.id}>
                        <td>{new Date(payment.paid_on).toLocaleDateString('es-PE')}</td>
                        <td className="text-mint">S/ {payment.amount.toFixed(2)}</td>
                        <td>{new Date(payment.period_start).toLocaleDateString('es-PE')}</td>
                        <td>{new Date(payment.period_end).toLocaleDateString('es-PE')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}