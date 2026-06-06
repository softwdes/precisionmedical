import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { FloatingAI } from '@/components/layout/floating-ai';

// Phoenix · Back Office · Admin layout
// Phase 1A: sin auth (vendrá con Supabase wire en Phase 1B).
// Para Phase 1A asumimos que el user actual es "Erick Salinas · Super Admin".

export default function AdminLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div className="min-h-screen bg-bg-0">
      <Sidebar />
      <div className="ml-[240px] flex flex-col min-h-screen">
        <Topbar
          userName="Erick Salinas"
          userRole="Super Admin"
          userInitials="ES"
        />
        <main className="flex-1 p-8">{children}</main>
      </div>
      <FloatingAI />
    </div>
  );
}
