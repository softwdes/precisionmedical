'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import { Search, LayoutDashboard, Users, UserCheck, DollarSign, Wallet, Settings, ArrowRight } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const t = useTranslations();

  const NAV_ITEMS = [
    { id: 'dashboard', label: t('nav.dashboard'), sublabel: t('commandPalette.dashboardSublabel'), href: '/dashboard', Icon: LayoutDashboard },
    { id: 'users', label: t('nav.users'), sublabel: t('commandPalette.usersSublabel'), href: '/dashboard/users', Icon: Users },
    { id: 'employees', label: t('nav.employees'), sublabel: t('commandPalette.employeesSublabel'), href: '/dashboard/employees', Icon: UserCheck },
    { id: 'payments', label: t('nav.payments'), sublabel: t('commandPalette.paymentsSublabel'), href: '/dashboard/payments', Icon: DollarSign },
    { id: 'petty-cash', label: t('nav.pettyCash'), sublabel: t('commandPalette.pettyCashSublabel'), href: '/dashboard/petty-cash', Icon: Wallet },
    { id: 'settings', label: t('nav.settings'), sublabel: t('commandPalette.settingsSublabel'), href: '/dashboard/settings', Icon: Settings },
  ];

  const { data: searchResults } = trpc.search.global.useQuery(
    { query },
    { enabled: open && query.trim().length >= 2 },
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const navigate = useCallback((href: string): void => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  if (!open) return <></>;

  const filteredNav = NAV_ITEMS.filter(
    (item) => query === '' || item.label.toLowerCase().includes(query.toLowerCase()),
  );

  const hasSearchResults =
    searchResults && (searchResults.employees.length > 0 || searchResults.users.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[560px] mx-4 rounded-xl border border-border bg-bg-1 shadow-2xl overflow-hidden animate-fade-in">
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search className="h-4 w-4 text-text-muted shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t('commandPalette.placeholder')}
              className="flex-1 py-3.5 bg-transparent text-small text-text-1 placeholder:text-text-muted outline-none"
              autoFocus
            />
            <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-tiny text-text-muted font-mono">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[380px] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center text-small text-text-muted">
              {t('commandPalette.noResults')} &ldquo;{query}&rdquo;
            </Command.Empty>

            {/* Navigation */}
            {!hasSearchResults && filteredNav.length > 0 && (
              <Command.Group>
                <div className="px-2 py-1.5 text-tiny font-bold uppercase tracking-widest text-text-muted">
                  {t('commandPalette.navigation')}
                </div>
                {filteredNav.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-brand/10 data-[selected=true]:text-brand transition-colors outline-none"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-surface border border-border shrink-0">
                      <item.Icon className="h-3.5 w-3.5 text-text-2" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-small text-text-1">{item.label}</p>
                      <p className="text-tiny text-text-3">{item.sublabel}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Employee results */}
            {searchResults?.employees && searchResults.employees.length > 0 && (
              <Command.Group>
                <div className="px-2 py-1.5 text-tiny font-bold uppercase tracking-widest text-text-muted">
                  {t('nav.employees')}
                </div>
                {searchResults.employees.map((emp) => (
                  <Command.Item
                    key={emp.id}
                    value={emp.id}
                    onSelect={() => navigate(emp.href)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-brand/10 transition-colors outline-none"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-tiny font-bold text-brand shrink-0">
                      {emp.label.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-small text-text-1">{emp.label}</p>
                      <p className="text-tiny text-text-3">{emp.sublabel}</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* User results */}
            {searchResults?.users && searchResults.users.length > 0 && (
              <Command.Group>
                <div className="px-2 py-1.5 text-tiny font-bold uppercase tracking-widest text-text-muted">
                  {t('nav.users')}
                </div>
                {searchResults.users.map((user) => (
                  <Command.Item
                    key={user.id}
                    value={user.id}
                    onSelect={() => navigate(user.href)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-brand/10 transition-colors outline-none"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan/10 text-tiny font-bold text-cyan shrink-0">
                      {user.label.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-small text-text-1">{user.label}</p>
                      <p className="text-tiny text-text-3">{user.sublabel}</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-t border-border">
            <span className="text-tiny text-text-muted">
              <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd> {t('commandPalette.navigate')}
            </span>
            <span className="text-tiny text-text-muted">
              <kbd className="rounded border border-border px-1 font-mono">↵</kbd> {t('commandPalette.open')}
            </span>
            <span className="text-tiny text-text-muted">
              <kbd className="rounded border border-border px-1 font-mono">ESC</kbd> {t('commandPalette.close')}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
