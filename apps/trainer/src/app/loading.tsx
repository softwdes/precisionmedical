export default function RootLoading() {
  return (
    <div className="app">
      <div className="sidebar" style={{ flexShrink: 0 }} />
      <main className="main">
        <header className="topbar">
          <div className="skeleton-block" style={{ height: '16px', width: '220px', borderRadius: '4px' }} />
        </header>
        <div className="main-content">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div className="skeleton-block" style={{ height: '32px', width: '280px' }} />
            <div className="metrics-row">
              {[1,2,3,4].map(i => (
                <div key={i} className="metric">
                  <div className="skeleton-block" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                  <div className="skeleton-block" style={{ height: '32px', width: '100px', marginBottom: '8px' }} />
                  <div className="skeleton-block" style={{ height: '4px' }} />
                </div>
              ))}
            </div>
            <div className="skeleton-block" style={{ height: '220px', borderRadius: 'var(--radius)' }} />
          </div>
        </div>
      </main>
    </div>
  );
}
