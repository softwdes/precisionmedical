'use client';

import { useEffect, useState } from 'react';
import { Bell, Search, Moon, Sun } from 'lucide-react';

interface TopbarProps {
  userName?: string;
  userRole?: string;
  userInitials?: string;
}

export function Topbar({
  userName = 'Erick Salinas',
  userRole = 'Super Admin',
  userInitials = 'ES',
}: TopbarProps): React.ReactElement {
  const [time, setTime] = useState('');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      setTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-bg-0/80 backdrop-blur-md px-6">
      {/* Search bar */}
      <button
        type="button"
        className="flex items-center gap-2 flex-1 max-w-md bg-bg-2 border border-border rounded-lg px-3 py-2 text-text-muted text-sm hover:border-border-strong transition-colors group"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="text-[10px] font-mono bg-bg-3 border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-3">
        {/* Time */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-2 border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-xs text-text-2 tabular-nums">{time}</span>
        </div>

        {/* Notification bell */}
        <button
          type="button"
          className="relative w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-white transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose text-white text-[9px] font-bold flex items-center justify-center">
            2
          </span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setIsDark(!isDark)}
          className="w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-white transition-colors"
          aria-label="Cambiar tema"
        >
          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {/* User */}
        <div className="flex items-center gap-3 pl-3 border-l border-border">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-sm text-white font-semibold">{userName}</span>
            <span className="text-[10px] text-text-muted uppercase tracking-wider">{userRole}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-cyan flex items-center justify-center text-white text-xs font-bold shadow-glow relative">
            {userInitials}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald border-2 border-bg-0" />
          </div>
        </div>
      </div>
    </header>
  );
}
