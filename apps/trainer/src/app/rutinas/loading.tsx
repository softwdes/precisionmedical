import AppSidebar from '@/components/AppSidebar';

export default function Loading() {
  return (
    <div className="app">
      <AppSidebar active="rutinas" />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title" style={{ opacity: 0.4 }}>Panel del Entrenador <span className="sep">//</span> Rutinas</div>
        </header>
        <div className="main-content">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="skeleton-block" style={{ height: '60px', width: '280px' }} />
            <div className="skeleton-block" style={{ height: '44px' }} />
            <div className="grid grid-3">
              <div className="skeleton-block" style={{ height: '220px' }} />
              <div className="skeleton-block" style={{ height: '220px' }} />
              <div className="skeleton-block" style={{ height: '220px' }} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
