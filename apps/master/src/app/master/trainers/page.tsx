import { getAdminContext } from '@/lib/supabase-server';
import { getMasterTrainers, getPlanes } from '@/actions/master';
import TrainersTable from '@/components/master/TrainersTable';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TrainersPage() {
  try {
    await getAdminContext();
  } catch {
    redirect('/login');
  }

  const [trainers, planes] = await Promise.all([getMasterTrainers(), getPlanes()]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          Master <span className="sep">//</span> <span className="crumb-active">Trainers</span>
        </div>
        <div className="topbar-right">
          <div className="live-indicator">En Vivo</div>
        </div>
      </header>

      <section className="section-head">
        <span className="eyebrow">Gestión // 02</span>
        <h1>Trainers</h1>
      </section>

      <TrainersTable initialTrainers={trainers} planes={planes} />
    </>
  );
}
