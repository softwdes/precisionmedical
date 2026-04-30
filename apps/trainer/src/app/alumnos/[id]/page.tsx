import Link from 'next/link';
import { getStudent, getStudentMetrics, getStudentPackages, getStudentRoutines } from '@/actions';
import { notFound } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudent(id);
  
  if (!student) {
    notFound();
  }

  const [metrics, packages, routines] = await Promise.all([
    getStudentMetrics(id),
    getStudentPackages(id),
    getStudentRoutines(id),
  ]);

  const latestMetric = metrics[0];

  return (
    <div className="app">
      <AppSidebar active="alumnos" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <Link href="/alumnos" className="crumb">Alumnos</Link> <span className="sep">//</span> <span className="crumb-active">{student.full_name}</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Paciente // 01</span>
            <h1>{student.full_name}</h1>
            <div className="row" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
              <span className={`badge ${student.experience_level === 'beginner' ? 'badge-mint-soft' : student.experience_level === 'intermediate' ? 'badge-accent' : 'badge'}`}>
                {student.experience_level === 'beginner' ? 'Principiante' : student.experience_level === 'intermediate' ? 'Intermedio' : student.experience_level === 'advanced' ? 'Avanzado' : 'Sin nivel'}
              </span>
              <span className="badge">
                {student.available_equipment === 'full_gym' ? 'Gym Completo' : student.available_equipment === 'home_basic' ? 'Gym Básico' : student.available_equipment === 'bodyweight' ? 'Peso Corporal' : 'Sin equipo'}
              </span>
              {student.goals && student.goals.length > 0 && (
                <span className="badge badge-mint-soft">
                  {student.goals.map((g: string) => g === 'hypertrophy' ? 'Hipertrofia' : g === 'strength' ? 'Fuerza' : g === 'fat_loss' ? 'Pérdida grasa' : g === 'endurance' ? 'Resistencia' : g).join(', ')}
                </span>
              )}
            </div>
          </section>

          <div className="student-detail-cols">
            <div className="student-detail-main">
              <section className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Métricas Biométricas</div>
                    <div className="card-subtitle">
                      {latestMetric 
                        ? `Última medición: ${new Date(latestMetric.measured_at).toLocaleDateString('es-PE')}`
                        : 'Sin métricas registradas'}
                    </div>
                  </div>
                  <button className="btn btn-outline">Agregar</button>
                </div>
                <div className="card-body">
                  {latestMetric ? (
                    <div className="metrics-row" style={{ border: 'none' }}>
                      <div className="metric">
                        <div className="label-caps">Peso</div>
                        <div className="metric-row">
                          <span className="metric-value">{latestMetric.weight_kg || '-'} kg</span>
                        </div>
                      </div>
                      <div className="metric">
                        <div className="label-caps">% Grasa</div>
                        <div className="metric-row">
                          <span className="metric-value">{latestMetric.body_fat_pct || '-'}%</span>
                        </div>
                      </div>
                      <div className="metric">
                        <div className="label-caps">Masa Muscular</div>
                        <div className="metric-row">
                          <span className="metric-value">{latestMetric.muscle_mass_kg || '-'} kg</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--fg-muted)' }}>
                      No hay métricas registradas
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Rutinas Asignadas</div>
                    <div className="card-subtitle">{routines.length} rutinas activas</div>
                  </div>
                  <Link href={`/alumnos/${id}/asignar-rutina`} className="btn btn-outline">Asignar Rutina</Link>
                </div>
                <div className="card-body card-body--padded">
                  {routines.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--fg-muted)' }}>
                      Este alumno no tiene rutinas asignadas
                    </div>
                  ) : (
                    <div className="routines-list">
                      {routines.map((routine) => (
                        <div key={routine.id} className="routine-item">
                          <div className="routine-info">
                            <div className="routine-name">Rutina Activa</div>
                            <div className="routine-dates">
                              {routine.starts_on && new Date(routine.starts_on).toLocaleDateString('es-PE')} - {routine.ends_on && new Date(routine.ends_on).toLocaleDateString('es-PE')}
                            </div>
                          </div>
                          <span className={`badge ${routine.active ? 'badge-accent' : 'badge'}`}>
                            {routine.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="student-sidebar">
              <section className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Paquete de Sesiones</div>
                  </div>
                </div>
                <div className="card-body card-body--padded">
                  {packages.length > 0 ? (
                    packages.map((pkg) => (
                      <div key={pkg.id} className="package-item">
                        <div className="package-header">
                          <span className="package-sessions">{pkg.used_sessions} / {pkg.total_sessions}</span>
                          <span className="package-amount">S/ {pkg.amount}</span>
                        </div>
                        <div className="package-bar">
                          <span style={{ width: `${(pkg.used_sessions / pkg.total_sessions) * 100}%` }}></span>
                        </div>
                        <div className="package-meta">
                          Comprado: {new Date(pkg.purchased_on).toLocaleDateString('es-PE')}
                          {pkg.expires_on && <span> | Vence: {new Date(pkg.expires_on).toLocaleDateString('es-PE')}</span>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 'var(--space-4)' }}>
                      Sin paquetes activos
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Información</div>
                  </div>
                  <Link href={`/alumnos/${id}/editar`} className="btn btn-ghost btn-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Link>
                </div>
                <div className="card-body card-body--padded">
                  <div className="info-list">
                    <div className="info-row">
                      <span className="info-label">Fecha de ingreso</span>
                      <span className="info-value">{new Date(student.created_at).toLocaleDateString('es-PE')}</span>
                    </div>
                    {student.birth_date && (
                      <div className="info-row">
                        <span className="info-label">Fecha de nacimiento</span>
                        <span className="info-value">{new Date(student.birth_date).toLocaleDateString('es-PE')}</span>
                      </div>
                    )}
                    {student.injuries && Array.isArray(student.injuries) && student.injuries.length > 0 && (
                      <div className="info-row">
                        <span className="info-label">Lesiones</span>
                        <span className="info-value">{JSON.stringify(student.injuries)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}