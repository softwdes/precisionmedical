import { getAuthContext } from '@/lib/supabase-server';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import NutricionModule from '@/components/NutricionModule';

export const dynamic = 'force-dynamic';

export default async function NutricionPage() {
  const { supabase, trainerId } = await getAuthContext();

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('trainer_id', trainerId)
    .is('archived_at', null)
    .order('full_name');

  return (
    <div className="app">
      <AppSidebar
        active="nutricion"
        systemStatus={
          <div className="system-status-row">
            <span>Suscripción</span>
            <span className="val accent">Activa</span>
          </div>
        }
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>{' '}
            <span className="crumb-active">Nutrición</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>
        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Nutrición // 01</span>
            <h1>Gestión Nutricional</h1>
          </section>
          <NutricionModule students={students ?? []} />
        </div>
      </main>
    </div>
  );
}
