import { redirect } from 'next/navigation';
import { getStudentContext } from '@/lib/supabase-server';
import StudentSidebar from '@/components/StudentSidebar';
import StudentMenu from '@/components/StudentMenu';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await getStudentContext();
  } catch {
    redirect('/login');
  }

  return (
    <div className="app">
      <StudentSidebar />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Neural <span style={{ color: 'var(--accent)' }}>Trainer</span> <span className="sep">//</span> <span className="crumb-active">Mi Entrenamiento</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <StudentMenu />
          </div>
        </header>
        <div className="main-content">
          {children}
        </div>
      </main>
    </div>
  );
}
