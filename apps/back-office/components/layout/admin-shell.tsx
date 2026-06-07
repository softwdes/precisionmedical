'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { FloatingAI } from './floating-ai';
import { BootAnimation } from './boot-animation';
import { NavigationProgressProvider } from './navigation-progress';

// Wrapper client component que maneja el state del mobile drawer.
// Desktop (md+): sidebar siempre visible · Mobile: drawer con hamburger.
//
// Envuelve TODO en:
//  - BootAnimation: splash 1.2s al primer mount + fade-in al contenido
//  - NavigationProgressProvider: barra global de progress arriba

export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <BootAnimation>
      <NavigationProgressProvider>
        <div className="min-h-screen bg-bg-0">
          <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

          {/* Backdrop mobile */}
          {mobileOpen && (
            <div
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
          )}

          <div className="md:ml-[240px] flex flex-col min-h-screen">
            <Topbar
              userName="Erick Salinas"
              userRole="Super Admin"
              userInitials="ES"
              onMenuClick={() => setMobileOpen(true)}
            />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">{children}</main>
          </div>
          <FloatingAI />
        </div>
      </NavigationProgressProvider>
    </BootAnimation>
  );
}
