import { getAdminContext } from '@/lib/supabase-server';
import { getPlanes } from '@/actions/master';
import PlanesGrid from '@/components/master/PlanesGrid';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PlanesPage() {
  try {
    await getAdminContext();
  } catch {
    redirect('/login');
  }

  const planes = await getPlanes();

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          Master <span className="sep">//</span> <span className="crumb-active">Planes</span>
        </div>
      </header>

      <section className="section-head">
        <span className="eyebrow">Plataforma // 03</span>
        <h1>Planes SaaS</h1>
      </section>

      <PlanesGrid planes={planes} />
    </>
  );
}
