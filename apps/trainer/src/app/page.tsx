import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

export default function TrainerDashboard() {
  return (
    <div className="app">
      <AppSidebar
        active="dashboard"
        systemStatus={
          <>
            <div className="system-status-row"><span>Alumnos</span><span className="val">24 / 30</span></div>
            <div className="system-status-row"><span>Sesiones Hoy</span><span className="val">8</span></div>
            <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
          </>
        }
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Dashboard</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          {/* ═══ SECTION: CENTRO DE CONTROL ═══ */}
          <section className="section-head">
            <span className="eyebrow">Telemetría // 01</span>
            <h1>Centro de Control</h1>
          </section>

          {/* ═══ METRICS ROW ═══ */}
          <section className="metrics-row">
            <div className="metric">
              <div className="label-caps">Alumnos Activos</div>
              <div className="metric-row">
                <span className="metric-value">24</span>
                <span className="metric-delta">+3</span>
              </div>
              <div className="metric-bar"><span style={{ width: '80%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Sesiones del Mes</div>
              <div className="metric-row">
                <span className="metric-value">87</span>
                <span className="metric-delta">+12.5%</span>
              </div>
              <div className="metric-bar"><span style={{ width: '72%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Ingresos (PEN)</div>
              <div className="metric-row">
                <span className="metric-value">S/ 8.4k</span>
                <span className="metric-delta">+8.1%</span>
              </div>
              <div className="metric-bar"><span style={{ width: '65%' }} /></div>
            </div>
            <div className="metric">
              <div className="label-caps">Asistencia</div>
              <div className="metric-row">
                <span className="metric-value">94%</span>
                <span className="metric-delta">Óptimo</span>
              </div>
              <div className="metric-bar"><span style={{ width: '94%' }} /></div>
            </div>
          </section>

          {/* ═══ REVENUE CHART ═══ */}
          <section className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Rendimiento Mensual</div>
                <div className="card-subtitle">+8.1% vs. mes anterior</div>
              </div>
              <div className="legend">
                <span className="legend-item accent">Ingresos</span>
                <span className="legend-item">Gastos</span>
              </div>
            </div>
            <div className="card-body">
              <svg className="chart" viewBox="0 0 1200 280" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mintGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3FF8C8" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#3FF8C8" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <g className="chart-grid">
                  <line x1="40" x2="1180" y1="40" y2="40"/>
                  <line x1="40" x2="1180" y1="100" y2="100"/>
                  <line x1="40" x2="1180" y1="160" y2="160"/>
                  <line x1="40" x2="1180" y1="220" y2="220"/>
                </g>
                <g className="chart-axis">
                  <text x="0" y="45">S/12k</text>
                  <text x="0" y="105">S/9k</text>
                  <text x="0" y="165">S/6k</text>
                  <text x="0" y="225">S/3k</text>
                  <text x="120" y="265">Ene</text><text x="280" y="265">Feb</text>
                  <text x="440" y="265">Mar</text><text x="600" y="265">Abr</text>
                  <text x="760" y="265">May</text><text x="920" y="265">Jun</text>
                  <text x="1080" y="265">Jul</text>
                </g>
                <path className="chart-area" d="M40,180 C160,170 280,150 400,130 C520,110 640,120 760,90 C880,60 1000,50 1180,40 L1180,240 L40,240 Z"/>
                <path className="chart-line" d="M40,180 C160,170 280,150 400,130 C520,110 640,120 760,90 C880,60 1000,50 1180,40"/>
                <path className="chart-line-muted" d="M40,200 C160,195 280,190 400,185 C520,180 640,185 760,180 C880,175 1000,178 1180,175"/>
              </svg>
            </div>
          </section>

          {/* ═══ WEEKLY FLOW + DISTRIBUTION ═══ */}
          <section className="grid grid-2">
            <div className="card">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-title">Flujo Semanal</div>
                  <div className="card-subtitle">Sesiones por día</div>
                </div>
              </div>
              <div className="card-body card-body--padded">
                <div className="bars">
                  <div className="chart-y"><span>20</span><span>15</span><span>10</span><span>5</span><span>0</span></div>
                  {['Lun','Mar','Mié','Jue','Vie','Sáb'].map((day, i) => (
                    <div key={day} className="bar-group">
                      <div className="bar-pair">
                        <div className="bar" style={{ height: `${[45,35,55,40,50,25][i]}%` }} />
                        <div className="bar muted" style={{ height: `${[70,80,65,75,60,40][i]}%` }} />
                      </div>
                      <div className="bar-label">{day}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-title">Distribución de Objetivos</div>
                  <div className="card-subtitle">Por tipo de entrenamiento</div>
                </div>
              </div>
              <div className="card-body card-body--padded">
                <div className="allocation">
                  {[
                    { name: 'Hipertrofia', pct: 42 },
                    { name: 'Pérdida de Grasa', pct: 25 },
                    { name: 'Fuerza', pct: 18 },
                    { name: 'Resistencia', pct: 10 },
                    { name: 'Rehabilitación', pct: 5 },
                  ].map((item) => (
                    <div key={item.name} className="allocation-row">
                      <div className="allocation-head">
                        <span className="allocation-name">{item.name}</span>
                        <span className="allocation-pct">{item.pct}%</span>
                      </div>
                      <div className="allocation-bar"><span style={{ width: `${item.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ═══ AGENDA DE SESIONES ═══ */}
          <section className="card">
            <div className="card-head">
              <div className="card-head-left">
                <span className="eyebrow">Protocolo // 02</span>
                <h2>Agenda de Sesiones</h2>
              </div>
              <span className="scheduled-pill">8 Programadas</span>
            </div>
            <div className="agenda">
              {[
                { time: '7:00 AM', goal: 'HIPERTROFIA', name: 'Carlos Mendoza', status: 'En Sesión', active: true },
                { time: '8:30 AM', goal: 'PÉRDIDA DE GRASA', name: 'María López', status: 'Confirmado', active: false },
                { time: '10:00 AM', goal: 'FUERZA', name: 'Diego Ramos', status: 'Confirmado', active: false },
                { time: '11:30 AM', goal: 'REHABILITACIÓN', name: 'Ana Torres', status: 'Pendiente', active: false },
                { time: '4:00 PM', goal: 'HIPERTROFIA', name: 'Pedro García', status: 'Confirmado', active: false },
              ].map((session) => (
                <div key={session.name} className={`agenda-row${session.active ? ' in-progress' : ''}`}>
                  <div className="agenda-time">{session.time}</div>
                  <div className="agenda-info">
                    <div className="agenda-diagnosis">{session.goal}</div>
                    <div className="agenda-patient">{session.name}</div>
                  </div>
                  <div className={`agenda-status${session.active ? ' active' : ''}`}>{session.status}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ DISPONIBILIDAD SEMANAL ═══ */}
          <section className="section-head">
            <span className="eyebrow">Protocolo // 03</span>
            <h2 style={{ fontSize: 'var(--text-2xl)' }}>Disponibilidad Horaria</h2>
            <p className="section-subtitle">Control en tiempo real de espacios y ocupación semanal.</p>
          </section>

          <div className="stack">
            <div className="label-caps">Vista Semanal</div>
            <div className="daygrid">
              {[
                { day: 'Lun', num: 28, util: 75 },
                { day: 'Mar', num: 29, util: 60, active: true },
                { day: 'Mié', num: 30, util: 85 },
                { day: 'Jue', num: 1, util: 45 },
                { day: 'Vie', num: 2, util: 70 },
              ].map((d) => (
                <div key={d.day} className={`daycard${d.active ? ' active' : ''}`}>
                  <div className="daycard-day">{d.day}</div>
                  <div className="daycard-num">{d.num}</div>
                  <div className="daycard-bar"><span style={{ width: `${d.util}%` }} /></div>
                  <div className="daycard-util">{d.util}% Ocup</div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ UTILIZACIÓN POR HORARIO ═══ */}
          <section className="grid grid-3">
            {[
              { name: 'Mañana (6-12)', pct: 85, sessions: 12 },
              { name: 'Tarde (12-18)', pct: 60, sessions: 8 },
              { name: 'Noche (18-21)', pct: 40, sessions: 4 },
            ].map((block) => (
              <div key={block.name} className="utilcard">
                <div className="utilcard-row">
                  <span className="utilcard-name">{block.name}</span>
                  <span className="utilcard-pct">{block.pct}%</span>
                </div>
                <div className="utilcard-bar"><span style={{ width: `${block.pct}%` }} /></div>
                <div className="utilcard-foot">
                  <span>{block.sessions} Sesiones</span>
                </div>
              </div>
            ))}
          </section>

        </div>
      </main>
    </div>
  );
}
