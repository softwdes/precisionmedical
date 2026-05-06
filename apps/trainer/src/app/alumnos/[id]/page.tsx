import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudent } from '@/actions/students';
import { getStudentRutinaActiva, getStudentRutinasHistorial } from '@/actions/rutinas';
import { getStudentCuotas, getStudentWaMensajes } from '@/actions/perfil';
import { getAuthContext } from '@/lib/supabase-server';
import AppSidebar from '@/components/AppSidebar';
import UserMenu from '@/components/UserMenu';
import AlumnoPerfilClient from './components/AlumnoPerfilClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const GOALS_MAP: Record<string, string> = {
  hypertrophy: 'Hipertrofia',
  strength: 'Fuerza',
  fat_loss: 'Pérdida de grasa',
  endurance: 'Resistencia',
  flexibility: 'Flexibilidad',
  general_fitness: 'Fitness general',
};

export default async function AlumnoPerfilPage({ params }: Props) {
  const { id } = await params;

  const [student, rutinaActiva, rutinasHistorial, cuotas, waMensajes] = await Promise.all([
    getStudent(id),
    getStudentRutinaActiva(id),
    getStudentRutinasHistorial(id),
    getStudentCuotas(id),
    getStudentWaMensajes(id),
  ]);

  if (!student) notFound();

  const { supabase } = await getAuthContext();
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .order('name');

  return (
    <div className="app">
      <AppSidebar active="alumnos" />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>{' '}
            <Link href="/alumnos" className="crumb">Alumnos</Link>{' '}
            <span className="sep">//</span>{' '}
            <span className="crumb-active">{student.full_name}</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <AlumnoPerfilClient
            student={student}
            goalsMap={GOALS_MAP}
            rutinaActiva={rutinaActiva as any}
            rutinasHistorial={rutinasHistorial}
            cuotas={cuotas}
            waMensajes={waMensajes}
            exercises={(exercises ?? []) as { id: string; name: string; muscle_group: string | null }[]}
          />
        </div>
      </main>
    </div>
  );
}
