import Link from 'next/link';
import { getStudents } from '@/actions';
import UserMenu from '@/components/UserMenu';
import NewStudentModal from '@/components/NewStudentModal';
import AppSidebar from '@/components/AppSidebar';

export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const students = await getStudents();

  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  return (
    <div className="app">
      <AppSidebar
        active="alumnos"
        systemStatus={
          <>
            <div className="system-status-row"><span>Alumnos</span><span className="val">{students.length} / 30</span></div>
            <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
          </>
        }
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Alumnos</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Telemetría // 01</span>
            <h1>Gestión de Alumnos</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="row">
              <input type="text" className="input" placeholder="Buscar alumno..." style={{ width: 'min(300px, 100%)' }} />
              <select className="select" style={{ width: 'min(180px, 100%)' }}>
                <option value="">Todos los niveles</option>
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
              </select>
            </div>
            <NewStudentModal />
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Directorio de Alumnos</div>
                <div className="card-subtitle">{students.length} alumnos activos</div>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Nivel</th>
                    <th>Objetivos</th>
                    <th>Equipo</th>
                    <th>Fecha Ingreso</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                        No hay alumnos registrados. Agrega tu primer alumno.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <Link href={`/alumnos/${student.id}`} className="student-name">
                            {student.full_name}
                          </Link>
                        </td>
                        <td>
                          <span className={`badge ${student.experience_level === 'beginner' ? 'badge-mint-soft' : student.experience_level === 'intermediate' ? 'badge-accent' : 'badge'}`}>
                            {student.experience_level === 'beginner' ? 'Principiante' : student.experience_level === 'intermediate' ? 'Intermedio' : student.experience_level === 'advanced' ? 'Avanzado' : '-'}
                          </span>
                        </td>
                        <td className="text-muted">
                          {(student.goals as string[] | null)?.map(g =>
                            g === 'hypertrophy' ? 'Hipertrofia' : g === 'strength' ? 'Fuerza' : g === 'fat_loss' ? 'Pérdida grasa' : g === 'endurance' ? 'Resistencia' : g
                          ).join(', ') || '-'}
                        </td>
                        <td className="text-muted">
                          {student.available_equipment === 'full_gym' ? 'Gym Completo' : student.available_equipment === 'home_basic' ? 'Gym Básico' : student.available_equipment === 'bodyweight' ? 'Peso Corporal' : '-'}
                        </td>
                        <td className="text-muted">{fmtDate(student.created_at)}</td>
                        <td>
                          <span className="status-dot active"></span>
                          <span className="status-text">Activo</span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 'var(--space-2)' }}>
                            <Link href={`/alumnos/${student.id}`} className="btn btn-ghost btn-icon" title="Ver detalle">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </Link>
                            <Link href={`/alumnos/${student.id}/editar`} className="btn btn-ghost btn-icon" title="Editar">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
