import * as React from 'react';
import { cn } from './lib/utils';

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("w-64 bg-surface border-r border-border h-screen flex flex-col", className)}>
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold bg-gradient-cifo bg-clip-text text-transparent">Precision Medical</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <div className="text-sm font-medium text-text-2 mb-2">Main</div>
        <a href="/admin/dashboard" className="block p-2 rounded-md bg-bg-2 text-brand font-medium">Dashboard</a>
      </nav>
    </aside>
  );
}
