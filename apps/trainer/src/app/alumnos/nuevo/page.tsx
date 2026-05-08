import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import NewStudentForm from './NewStudentForm';

export default function NewStudentPage() {
  return (
    <div className="app">
      <AppSidebar active="alumnos" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>
            <Link href="/alumnos" className="crumb">Alumnos</Link> <span className="sep">//</span>
            <span className="crumb-active">Nuevo</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 01</span>
            <h1>Nuevo Alumno</h1>
          </section>

          <div className="card" style={{ maxWidth: '800px' }}>
            <div className="card-body card-body--padded">
              <NewStudentForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
