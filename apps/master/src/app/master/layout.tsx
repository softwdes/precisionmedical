import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/supabase-server';
import MasterSidebar from '@/components/master/MasterSidebar';

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  let email = '';
  try {
    const ctx = await getAdminContext();
    email = ctx.email;
  } catch (e) {
    if (e instanceof Error && e.message === 'forbidden') {
      redirect('/unauthorized');
    }
    redirect('/login');
  }

  return (
    <div className="app">
      <MasterSidebar email={email} />
      <main className="main">
        <div className="main-content">
          {children}
        </div>
      </main>
    </div>
  );
}
