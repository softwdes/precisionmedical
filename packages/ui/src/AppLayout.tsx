import * as React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from './index';

export function AppLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-screen w-full overflow-hidden bg-bg-0", className)}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
