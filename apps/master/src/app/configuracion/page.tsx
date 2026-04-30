import Link from 'next/link';

export default function ConfiguracionPage() {
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
          <Link href="/master/soporte" className="nav-item">Soporte</Link>
          <Link href="/master/configuracion" className="nav-item active">Configuración</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Configuración</span>
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
            <h1>Configuración Global</h1>
          </section>

          <div className="row" style={{ gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card-head">
                <div className="card-title">Identidad de la Plataforma</div>
              </div>
              <div className="card-body">
                <form className="form-stack">
                  <div className="form-group">
                    <label className="form-label">Nombre de la Plataforma</label>
                    <input type="text" className="input" defaultValue="Precision Trainer" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dominio Principal</label>
                    <input type="text" className="input" defaultValue="precisiontrainer.app" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email de Soporte</label>
                    <input type="email" className="input" defaultValue="soporte@precisiontrainer.com" />
                  </div>
                  <button type="submit" className="btn btn-primary">Guardar</button>
                </form>
              </div>
            </div>

            <div className="card" style={{ flex: 1 }}>
              <div className="card-head">
                <div className="card-title">Precios por Defecto</div>
              </div>
              <div className="card-body">
                <form className="form-stack">
                  <div className="form-group">
                    <label className="form-label">Precio Mensual (PEN)</label>
                    <input type="number" className="input" defaultValue="299" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio Anual (PEN)</label>
                    <input type="number" className="input" defaultValue="2490" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Días de Prueba</label>
                    <input type="number" className="input" defaultValue="14" />
                  </div>
                  <button type="submit" className="btn btn-primary">Guardar</button>
                </form>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-head">
              <div className="card-title">Integraciones</div>
            </div>
            <div className="card-body">
              <div className="integrations-grid">
                <div className="integration-card">
                  <div className="integration-header">
                    <span className="integration-name">WhatsApp Business</span>
                    <span className="badge badge-warning">Pendiente</span>
                  </div>
                  <div className="integration-desc">API para notificaciones automáticas</div>
                  <button className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }}>Configurar</button>
                </div>

                <div className="integration-card">
                  <div className="integration-header">
                    <span className="integration-name">Culqi / Niubiz</span>
                    <span className="badge badge-warning">Pendiente</span>
                  </div>
                  <div className="integration-desc">Procesador de pagos en PEN</div>
                  <button className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }}>Configurar</button>
                </div>

                <div className="integration-card">
                  <div className="integration-header">
                    <span className="integration-name">SUNAT (OSE)</span>
                    <span className="badge badge-warning">Pendiente</span>
                  </div>
                  <div className="integration-desc">Comprobantes electrónicos</div>
                  <button className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }}>Configurar</button>
                </div>

                <div className="integration-card">
                  <div className="integration-header">
                    <span className="integration-name">Anthropic Claude</span>
                    <span className="badge badge-mint-soft">Activo</span>
                  </div>
                  <div className="integration-desc">IA Coach para generación de rutinas</div>
                  <button className="btn btn-ghost" style={{ marginTop: 'var(--space-3)' }}>Ver API Key</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">White Label Defaults</div>
              <div className="card-subtitle">Valores por defecto para nuevos trainers</div>
            </div>
            <div className="card-body">
              <div className="whitelabel-grid">
                <div className="whitelabel-item">
                  <div className="whitelabel-label">Color Primario</div>
                  <div className="whitelabel-value">
                    <div className="color-swatch" style={{ backgroundColor: '#3FF8C8' }}></div>
                    <span className="mono">#3FF8C8</span>
                  </div>
                </div>
                <div className="whitelabel-item">
                  <div className="whitelabel-label">Color de Fondo</div>
                  <div className="whitelabel-value">
                    <div className="color-swatch" style={{ backgroundColor: '#0A0A0A' }}></div>
                    <span className="mono">#0A0A0A</span>
                  </div>
                </div>
                <div className="whitelabel-item">
                  <div className="whitelabel-label">Logo</div>
                  <div className="whitelabel-value">
                    <span className="text-muted">No configurado</span>
                  </div>
                </div>
                <div className="whitelabel-item">
                  <div className="whitelabel-label">Favicon</div>
                  <div className="whitelabel-value">
                    <span className="text-muted">No configurado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}