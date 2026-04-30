import Link from 'next/link';
import { getRoutineTemplates } from '@/actions';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

export const dynamic = 'force-dynamic';

export default async function RoutinesPage() {
  const templates = await getRoutineTemplates();

  return (
    <div className="app">
      <AppSidebar
        active="rutinas"
        systemStatus={
          <>
            <div className="system-status-row"><span>Plantillas</span><span className="val">{templates.length}</span></div>
            <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
          </>
        }
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Rutinas</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Telemetría // 01</span>
            <h1>Gestión de Rutinas</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="row">
              <input type="text" className="input" placeholder="Buscar plantilla..." style={{ width: 'min(300px, 100%)' }} />
              <select className="select" style={{ width: 'min(180px, 100%)' }}>
                <option value="">Todos los objetivos</option>
                <option value="hypertrophia">Hipertrofia</option>
                <option value="strength">Fuerza</option>
                <option value="fat_loss">Pérdida de Grasa</option>
                <option value="endurance">Resistencia</option>
              </select>
            </div>
            <Link href="/rutinas/nueva" className="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nueva Plantilla
            </Link>
          </div>

          <div className="grid grid-3">
            {templates.length === 0 ? (
              <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-12)' }}>
                <div style={{ color: 'var(--fg-muted)', marginBottom: 'var(--space-4)' }}>
                  No hay plantillas de rutinas creadas
                </div>
                <Link href="/rutinas/nueva" className="btn btn-outline">Crear Primera Rutina</Link>
              </div>
            ) : (
              templates.map((template) => {
                const payload = template.payload as any;
                const exerciseCount = payload?.exercises?.length || 0;
                return (
                  <div key={template.id} className="card routine-card">
                    <div className="card-head">
                      <div className="card-head-left">
                        <div className="card-title">{template.name}</div>
                        <div className="card-subtitle">
                          {template.goal === 'hypertrophy' ? 'Hipertrofia' :
                           template.goal === 'strength' ? 'Fuerza' :
                           template.goal === 'fat_loss' ? 'Pérdida de Grasa' :
                           template.goal === 'endurance' ? 'Resistencia' : 'Sin objetivo'}
                        </div>
                      </div>
                      {template.generated_by_ai && <span className="badge badge-accent">IA</span>}
                    </div>
                    <div className="card-body card-body--padded">
                      <div className="routine-meta">
                        <div className="meta-item">
                          <span className="meta-label">Duración</span>
                          <span className="meta-value">{template.weeks} semanas</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Ejercicios</span>
                          <span className="meta-value">{exerciseCount}</span>
                        </div>
                      </div>
                      {payload?.exercises?.slice(0, 3).map((ex: any, i: number) => (
                        <div key={i} className="exercise-preview">
                          <span className="exercise-name">{ex.name}</span>
                          <span className="exercise-details">{ex.sets} series × {ex.reps}</span>
                        </div>
                      ))}
                      {exerciseCount > 3 && (
                        <div className="exercise-more">+{exerciseCount - 3} ejercicios más</div>
                      )}
                    </div>
                    <div className="card-footer">
                      <Link href={`/rutinas/${template.id}`} className="btn btn-ghost">Ver Detalle</Link>
                      <Link href={`/rutinas/${template.id}/editar`} className="btn btn-outline">Editar</Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
