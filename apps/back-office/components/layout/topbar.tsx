'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Bell, Search, Moon, Sun, Languages } from 'lucide-react';
import { CommandPalette } from './command-palette';

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
  const router = useRouter();
  const currentLocale = useLocale();
  const [time, setTime] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Keyboard shortcut: ⌘K / Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Mount-only: read theme from localStorage (already applied by inline script)
  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== 'undefined' ? localStorage.getItem('pm_theme') : null;
    setTheme((saved === 'light' ? 'light' : 'dark'));
  }, []);

  // Live clock
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

  // Theme toggle: persist + apply
  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pm_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // Language toggle: set cookie + reload (next-intl picks up new locale on server)
  const toggleLocale = (): void => {
    const next = currentLocale === 'en' ? 'es' : 'en';
    // 1 año de persistencia
    document.cookie = `locale=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    router.refresh();
    // Forced reload para asegurar que el resto de la app pick up el cambio
    setTimeout(() => window.location.reload(), 50);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-bg-0/80 backdrop-blur-md px-6">
      {/* Search bar — opens command palette */}
      <button
        type="button"
        onClick={() => setCmdOpen(true)}
        className="flex items-center gap-2 flex-1 max-w-md bg-bg-2 border border-border rounded-lg px-3 py-2 text-text-muted text-sm hover:border-border-strong transition-colors group"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{currentLocale === 'es' ? 'Buscar bufetes, servicios, diagnósticos...' : 'Search firms, services, diagnoses...'}</span>
        <kbd className="text-[10px] font-mono bg-bg-3 border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Time */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-2 border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-xs text-text-2 tabular-nums">{time}</span>
        </div>

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLocale}
          className="h-9 px-3 rounded-md hover:bg-white/5 flex items-center gap-1.5 text-text-2 hover:text-white transition-colors"
          aria-label={currentLocale === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'}
          title={currentLocale === 'es' ? 'Cambiar a EN' : 'Switch to ES'}
        >
          <Languages className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tabular-nums">{currentLocale}</span>
        </button>

        {/* Notification bell */}
        <button
          type="button"
          className="relative w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-white transition-colors"
          aria-label={currentLocale === 'es' ? 'Notificaciones' : 'Notifications'}
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose text-white text-[9px] font-bold flex items-center justify-center">
            2
          </span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-white transition-colors"
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {mounted ? (
            theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* User */}
        <div className="flex items-center gap-3 pl-3 ml-1 border-l border-border">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-sm text-text-1 font-semibold">{userName}</span>
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
