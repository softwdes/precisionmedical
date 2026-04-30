import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

export default function Configuracion() {
  return (
    <div className="app">
      <AppSidebar active="configuracion" />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Configuración</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>
        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Configuración // 01</span>
            <h1>Ajustes del Sistema</h1>
          </section>
          <div className="card">
            <div className="card-body" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--fg-muted)' }}>Módulo de configuración en desarrollo...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
