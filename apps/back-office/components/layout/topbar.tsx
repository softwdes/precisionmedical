'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, Search, Moon, Sun, Menu } from 'lucide-react';
import { CommandPalette } from './command-palette';

interface TopbarProps {
  userName?: string;
  userRole?: string;
  userInitials?: string;
  onMenuClick?: () => void;
}

export function Topbar({
  userName = 'Erick Salinas',
  userRole = 'Super Admin',
  userInitials = 'ES',
  onMenuClick,
}: TopbarProps): React.ReactElement {
  const router = useRouter();
  const currentLocale = useLocale();
  const t = useTranslations('phoenix.topbar');

  const [time, setTime] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<'en' | 'es' | null>(null);
  const [isPending, startTransition] = useTransition();
  const switchingLocale = isPending && pendingLocale !== null;

  // Cuando el RSC re-render termina y currentLocale ya coincide con el pending,
  // limpiamos el pendingLocale para que el pill optimista vuelva a reflejar la verdad.
  useEffect(() => {
    if (pendingLocale && currentLocale === pendingLocale) {
      setPendingLocale(null);
    }
  }, [currentLocale, pendingLocale]);

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

  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== 'undefined' ? localStorage.getItem('pm_theme') : null;
    setTheme((saved === 'light' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pm_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const setLocale = (next: 'en' | 'es'): void => {
    if (next === currentLocale || switchingLocale) return;
    // Optimistic UI: el pill activo cambia al instante
    setPendingLocale(next);
    // Cookie write síncrono · el próximo RSC request ya tiene el nuevo locale
    document.cookie = `locale=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    // Soft refresh: re-fetch RSC tree con la cookie nueva · sin descargar assets
    // El NextIntlClientProvider recibe nuevos messages y actualiza useTranslations.
    startTransition(() => {
      router.refresh();
    });
  };

  // Para el render optimista, mostrar pendingLocale si lo hay
  const displayedLocale = pendingLocale ?? currentLocale;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 sm:gap-4 border-b border-border bg-bg-0/80 backdrop-blur-md px-3 sm:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="md:hidden w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search bar — opens command palette */}
      <button
        type="button"
        onClick={() => setCmdOpen(true)}
        className="flex items-center gap-2 flex-1 max-w-md bg-bg-2 border border-border rounded-lg px-3 py-2 text-text-muted text-sm hover:border-border-strong transition-colors group"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate text-xs sm:text-sm">{t('search')}</span>
        <kbd className="hidden sm:inline text-[10px] font-mono bg-bg-3 border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      <div className="hidden lg:block flex-1" />

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Time — solo desktop */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-2 border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-xs text-text-2 tabular-nums">{time}</span>
        </div>

        {/* Language toggle · segmented control EN / ES · optimistic + soft refresh */}
        <div
          className="inline-flex items-center h-9 p-0.5 rounded-md bg-bg-2 border border-border"
          role="group"
          aria-label={t('switchLanguage')}
          aria-busy={switchingLocale}
        >
          {(['en', 'es'] as const).map((code) => {
            const active = displayedLocale === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                disabled={switchingLocale}
                aria-pressed={active}
                aria-label={`Switch to ${code.toUpperCase()}`}
                className={`px-2.5 h-full min-w-[2.25rem] rounded text-[11px] font-bold uppercase tabular-nums tracking-wider transition-all disabled:cursor-not-allowed ${
                  active
                    ? 'bg-gradient-brand text-white shadow-glow'
                    : 'text-text-muted hover:text-text-1'
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>

        {/* Notification bell */}
        <button
          type="button"
          className="relative w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
          aria-label={t('notifications')}
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
          className="w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
          aria-label={t('switchTheme')}
          title={t('switchTheme')}
        >
          {mounted ? (theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />) : <Moon className="w-4 h-4" />}
        </button>

        {/* User */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 ml-1 border-l border-border">
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
