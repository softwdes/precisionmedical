import { getStudents } from '@/actions';
import { createClient } from '@/lib/supabase-server';
import UserMenu from '@/components/UserMenu';
import NewStudentModal from '@/components/NewStudentModal';
import StudentsTable from '@/components/StudentsTable';
import AppSidebar from '@/components/AppSidebar';

export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const [students, supabase] = await Promise.all([getStudents(), createClient()]);

  const { data: goalsData } = await supabase.from('goals').select('id, label');
  const goalsMap = Object.fromEntries((goalsData ?? []).map(g => [g.id, g.label]));


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
            <StudentsTable students={students} goalsMap={goalsMap} />
          </div>
        </div>
      </main>
    </div>
  );
}
