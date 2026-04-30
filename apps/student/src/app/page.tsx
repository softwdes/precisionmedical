export default function StudentDashboard() {
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
            <div className="brand-tag">Mi Entrenamiento</div>
          </div>
        </div>
        <nav className="nav">
          <a href="#" className="nav-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Inicio
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            Mi Rutina
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="1"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Reservar
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Progreso
          </a>
          <a href="#" className="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Chat
          </a>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Mi Entrenamiento <span className="sep">//</span> <span className="crumb-active">Inicio</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <div className="user-chip">
              <div>
                <div className="user-name">Carlos Mendoza</div>
                <div className="user-role">Alumno</div>
              </div>
              <span className="user-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              </span>
            </div>
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Bienvenido // Carlos</span>
            <h1>Tu Progreso</h1>
          </section>

          <section className="metrics-row">
            <div className="metric">
              <div className="label-caps">Peso Actual</div>
              <div className="metric-row">
                <span className="metric-value">78.5</span>
                <span className="metric-delta">-1.2 kg</span>
              </div>
              <div className="metric-bar"><span style={{ width: '65%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">% Grasa</div>
              <div className="metric-row">
                <span className="metric-value">18.2%</span>
                <span className="metric-delta">-0.8%</span>
              </div>
              <div className="metric-bar"><span style={{ width: '55%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Sesiones Restantes</div>
              <div className="metric-row">
                <span className="metric-value">6</span>
                <span className="metric-delta">de 12</span>
              </div>
              <div className="metric-bar"><span style={{ width: '50%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Racha</div>
              <div className="metric-row">
                <span className="metric-value">14</span>
                <span className="metric-delta">días</span>
              </div>
              <div className="metric-bar"><span style={{ width: '100%' }} /></div>
            </div>
          </section>

          {/* Rutina del día */}
          <section className="card">
            <div className="card-head">
              <div className="card-head-left">
                <span className="eyebrow">Hoy // Día 3</span>
                <h2>Empuje — Pecho y Hombros</h2>
              </div>
              <span className="scheduled-pill">6 Ejercicios</span>
            </div>
            <div className="agenda">
              {[
                { order: '01', exercise: 'PRESS DE BANCA CON BARRA', detail: '4×6-8 · RPE 8 · 120s', active: true },
                { order: '02', exercise: 'PRESS INCLINADO MANCUERNAS', detail: '3×8-10 · RPE 7 · 90s', active: false },
                { order: '03', exercise: 'APERTURAS CON CABLES', detail: '3×12-15 · RPE 7 · 60s', active: false },
                { order: '04', exercise: 'PRESS MILITAR', detail: '4×6-8 · RPE 8 · 120s', active: false },
                { order: '05', exercise: 'ELEVACIONES LATERALES', detail: '3×12-15 · RPE 7 · 60s', active: false },
                { order: '06', exercise: 'FONDOS EN PARALELAS', detail: '3×AMRAP · RPE 9 · 90s', active: false },
              ].map((ex) => (
                <div key={ex.order} className={`agenda-row${ex.active ? ' in-progress' : ''}`}>
                  <div className="agenda-time" style={{ fontFamily: 'var(--font-mono)' }}>{ex.order}</div>
                  <div className="agenda-info">
                    <div className="agenda-diagnosis">{ex.detail}</div>
                    <div className="agenda-patient">{ex.exercise}</div>
                  </div>
                  <div className={`agenda-status${ex.active ? ' active' : ''}`}>
                    {ex.active ? 'En Curso' : 'Pendiente'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Próximas sesiones */}
          <section className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Próximas Reservas</div>
              </div>
            </div>
            <div className="agenda">
              {[
                { time: 'Mañana 7:00 AM', type: 'TIRÓN — ESPALDA', trainer: 'Coach Carlos M.', status: 'Confirmado' },
                { time: 'Jue 7:00 AM', type: 'PIERNAS', trainer: 'Coach Carlos M.', status: 'Pendiente' },
              ].map((s) => (
                <div key={s.time} className="agenda-row">
                  <div className="agenda-time">{s.time}</div>
                  <div className="agenda-info">
                    <div className="agenda-diagnosis">{s.type}</div>
                    <div className="agenda-patient">{s.trainer}</div>
                  </div>
                  <div className="agenda-status">{s.status}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
