import { getRutinaTemplates } from '@/actions/rutinas';
import { getAuthContext } from '@/lib/supabase-server';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import RutinasModule from '@/components/RutinasModule';

export const dynamic = 'force-dynamic';

export default async function AsignarPage() {
  const { supabase, trainerId } = await getAuthContext();

  const [templates, studentsRes, exercisesRes] = await Promise.all([
    getRutinaTemplates(),
    supabase.from('students').select('id, full_name').eq('trainer_id', trainerId).is('archived_at', null).order('full_name'),
    supabase.from('exercises').select('id, name, muscle_group').order('name'),
  ]);

  return (
    <div className="app">
      <AppSidebar
        active="asignar"
        systemStatus={
          <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
        }
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Asignar Rutina</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>
        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Rutinas // 02</span>
            <h1>Asignar Rutina</h1>
          </section>
          <RutinasModule
            initialTemplates={templates}
            students={studentsRes.data ?? []}
            exercises={exercisesRes.data ?? []}
          />
        </div>
      </main>
    </div>
  );
}
