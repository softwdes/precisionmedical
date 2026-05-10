import * as React from 'react';
import { cn } from './lib/utils';

export function Topbar({ className }: { className?: string }) {
  return (
    <header className={cn("h-16 bg-surface border-b border-border flex items-center px-6 justify-between", className)}>
      <div className="flex-1">
        <input type="text" placeholder="Search..." className="bg-bg-1 border border-border rounded-md px-3 py-1 text-sm text-text-1" />
      </div>
      <div className="flex items-center space-x-4">
        <div className="text-sm text-text-2">ES | EN</div>
        <div className="text-sm text-text-2">Light | Dark</div>
        <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold">
          A
        </div>
      </div>
    </header>
  );
}
