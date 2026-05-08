import Link from 'next/link';
import { getStudent } from '@/actions';
import { notFound } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import EditStudentForm from './EditStudentForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStudentPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudent(id);
  
  if (!student) {
    notFound();
  }

  return (
    <div className="app">
      <AppSidebar active="alumnos" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> 
            <Link href="/alumnos" className="crumb">Alumnos</Link> <span className="sep">//</span> 
            <Link href={`/alumnos/${id}`} className="crumb">{student.full_name}</Link> <span className="sep">//</span> 
            <span className="crumb-active">Editar</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 02</span>
            <h1>Editar Alumno</h1>
          </section>

          <div className="card" style={{ maxWidth: '800px' }}>
            <div className="card-body card-body--padded">
              <EditStudentForm student={student} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}