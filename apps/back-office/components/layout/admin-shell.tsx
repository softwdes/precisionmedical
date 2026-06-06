'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { FloatingAI } from './floating-ai';

// Wrapper client component que maneja el state del mobile drawer.
// Desktop (md+): sidebar siempre visible · Mobile: drawer con hamburger.

export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
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
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <FloatingAI />
    </div>
  );
}
