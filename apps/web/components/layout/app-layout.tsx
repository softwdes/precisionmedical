'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { CifoChat } from './cifo-chat';
import { BottomNav } from './bottom-nav';
import { RoleProvider } from '@/contexts/role-context';
import type { Role } from '@/lib/permissions';

interface AppLayoutProps {
  children: React.ReactNode;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  avatarUrl?: string;
  role?: Role;
  userId?: string;
}

export function AppLayout({
  children,
  userName,
  userRole,
  userEmail,
  avatarUrl,
  role = 'employee',
  userId,
}: AppLayoutProps): React.ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <RoleProvider role={role}>
      <div className="flex min-h-screen bg-bg-0">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex flex-1 flex-col md:ml-[240px]">
          <Topbar
            onMenuClick={() => setSidebarOpen(true)}
            userName={userName}
            userRole={userRole}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
          />

          <main className="flex-1 p-5 md:p-7 pb-24 md:pb-7 animate-fade-in">
            {children}
          </main>
        </div>

        <CifoChat />

        {/* Bottom nav estilo app nativa — solo en movil (<md). El boton
            "Mas" reusa el mismo toggle del sidebar drawer. */}
        <BottomNav onMoreClick={() => setSidebarOpen(true)} />
      </div>
    </RoleProvider>
  );
}
