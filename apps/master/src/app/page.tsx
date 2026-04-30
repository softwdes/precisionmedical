export default function MasterDashboard() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Precision</div>
            <div className="brand-tag">Master Panel</div>
          </div>
        </div>
        <nav className="nav">
          <a href="#" className="nav-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Dashboard
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            Trainers
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            Suscripciones
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            Auditoría
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            Soporte
          </a>
        </nav>
        <div className="system-status">
          <div className="system-status-title">Plataforma</div>
          <div className="system-status-row"><span>Trainers</span><span className="val">12</span></div>
          <div className="system-status-row"><span>Alumnos</span><span className="val">287</span></div>
          <div className="system-status-row"><span>Uptime</span><span className="val accent">99.9%</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Master Panel <span className="sep">//</span> <span className="crumb-active">Dashboard</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <div className="user-chip">
              <div>
                <div className="user-name">Admin</div>
                <div className="user-role">SaaS Master</div>
              </div>
              <span className="user-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              </span>
            </div>
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Plataforma // 01</span>
            <h1>Panel de Control SaaS</h1>
          </section>

          <section className="metrics-row">
            <div className="metric">
              <div className="label-caps">Trainers Activos</div>
              <div className="metric-row">
                <span className="metric-value">12</span>
                <span className="metric-delta">+2</span>
              </div>
              <div className="metric-bar"><span style={{ width: '60%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">MRR (PEN)</div>
              <div className="metric-row">
                <span className="metric-value">S/ 14.4k</span>
                <span className="metric-delta">+16.7%</span>
              </div>
              <div className="metric-bar"><span style={{ width: '72%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Alumnos Totales</div>
              <div className="metric-row">
                <span className="metric-value">287</span>
                <span className="metric-delta">+34</span>
              </div>
              <div className="metric-bar"><span style={{ width: '85%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Llamadas IA</div>
              <div className="metric-row">
                <span className="metric-value">1.2k</span>
                <span className="metric-delta">Este mes</span>
              </div>
              <div className="metric-bar"><span style={{ width: '45%' }} /></div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-head-left">
                <span className="eyebrow">Gestión // 02</span>
                <h2>Suscripciones</h2>
              </div>
              <span className="scheduled-pill">12 Activas</span>
            </div>
            <div className="agenda">
              {[
                { name: 'Coach Carlos M.', status: 'Activa', days: '320 días', active: true },
                { name: 'Fit Studio Lima', status: 'Activa', days: '180 días', active: true },
                { name: 'Power Gym', status: 'Por Vencer', days: '12 días', active: false },
                { name: 'Elite Training', status: 'Suspendida', days: 'Vencida', active: false },
              ].map((t) => (
                <div key={t.name} className={`agenda-row${t.active ? ' in-progress' : ''}`}>
                  <div className="agenda-time">{t.days}</div>
                  <div className="agenda-info">
                    <div className="agenda-diagnosis">PERSONAL TRAINER</div>
                    <div className="agenda-patient">{t.name}</div>
                  </div>
                  <div className={`agenda-status${t.active ? ' active' : ''}`}>{t.status}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
