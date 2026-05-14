'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@precision-medical/ui';
import { PillToggle } from '@precision-medical/ui';
import { useTheme } from '@/components/providers/theme-provider';
import { Bell, Search, Menu, Moon, Sun } from 'lucide-react';
import { api as trpc } from '@/lib/trpc/client';
import { NotificationsDrawer } from './notifications-drawer';
import { CommandPalette } from './command-palette';

interface TopbarProps {
  onMenuClick: () => void;
  userName?: string;
  userRole?: string;
  avatarUrl?: string;
}

export function Topbar({
  onMenuClick,
  userName = 'Erick Salinas',
  userRole = 'Super Admin',
  avatarUrl,
}: TopbarProps): React.ReactElement {
  const t = useTranslations();
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState('');
  const [locale, setLocale] = useState<'es' | 'en'>('es');
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const cookieLocale = document.cookie
      .split('; ')
      .find((row) => row.startsWith('locale='))
      ?.split('=')[1] as 'es' | 'en' | undefined;
    if (cookieLocale === 'en' || cookieLocale === 'es') {
      setLocale(cookieLocale);
    }
  }, []);

  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLocaleChange = (newLocale: 'es' | 'en'): void => {
    setLocale(newLocale);
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    window.location.reload();
  };

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-sticky flex h-14 items-center gap-3 border-b border-border bg-bg-0/80 px-4 backdrop-blur-md">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded text-text-3 hover:bg-surface hover:text-text-1 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <button
          onClick={() => setCmdOpen(true)}
          className="flex h-8 flex-1 max-w-xs items-center gap-2 rounded border border-border bg-surface px-3 text-small text-text-muted hover:border-border-strong transition-colors"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>{t('common.search')}...</span>
          <span className="ml-auto font-mono text-tiny text-text-muted border border-border rounded px-1">⌘K</span>
        </button>

        <div className="sm:flex-1" />

        {/* Clock — HH:MM:SS with cyan pill and pulse dot */}
        <div
          className="hidden items-center gap-2 h-8 rounded-xl border px-3 sm:flex"
          style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.20)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulse"
            style={{ boxShadow: '0 0 8px #06B6D4' }}
          />
          <span className="font-mono text-[12px] font-semibold text-cyan tracking-wide">{time}</span>
        </div>

        {/* Notifications bell — moved before theme toggle to match design */}
        <button
          onClick={() => setNotifOpen(true)}
          className="relative flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1 transition-all"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose text-[9px] font-bold text-white px-0.5"
              style={{ boxShadow: '0 0 8px rgba(244,63,94,0.6)' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Theme — pill group with both Moon and Sun buttons */}
        <div className="hidden items-center gap-0.5 p-1 rounded-xl border border-border bg-surface h-8 sm:flex">
          <button
            onClick={() => theme !== 'dark' && toggleTheme()}
            className={cn(
              'flex h-6 w-7 items-center justify-center rounded-[8px] transition-all',
              theme === 'dark'
                ? 'bg-gradient-brand text-white shadow-sm'
                : 'text-text-3 hover:text-text-1',
            )}
            aria-label="Modo oscuro"
          >
            <Moon className="h-3 w-3" />
          </button>
          <button
            onClick={() => theme !== 'light' && toggleTheme()}
            className={cn(
              'flex h-6 w-7 items-center justify-center rounded-[8px] transition-all',
              theme === 'light'
                ? 'bg-gradient-brand text-white shadow-sm'
                : 'text-text-3 hover:text-text-1',
            )}
            aria-label="Modo claro"
          >
            <Sun className="h-3 w-3" />
          </button>
        </div>

        {/* Language switcher */}
        <PillToggle
          options={[
            { value: 'es', label: 'ES' },
            { value: 'en', label: 'EN' },
          ]}
          value={locale}
          onChange={handleLocaleChange}
        />

        {/* Avatar — 32px, gradient, 2-letter initials, green online dot */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2 py-1 hover:border-border-strong transition-all cursor-pointer">
          <div className="relative shrink-0">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-brand text-xs font-bold text-white overflow-hidden"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="h-8 w-8 object-cover" />
              ) : (
                initials
              )}
            </div>
            <span
              className="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full bg-emerald border-2 border-bg-0"
              style={{ boxShadow: '0 0 6px #10B981' }}
            />
          </div>
          <div className="hidden flex-col sm:flex">
            <span className="text-small font-semibold text-text-1 leading-none">{userName}</span>
            <span className="text-tiny text-text-3 leading-none mt-0.5">{userRole}</span>
          </div>
        </div>
      </header>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
