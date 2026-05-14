'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@precision/ui';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Banknote,
  BarChart3,
  Bot,
  Settings,
  ChevronLeft,
} from 'lucide-react';

interface NavItem {
  key: string;
  href: string;
  icon: React.ElementType;
  label: string;
  phase?: number;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations();

  const NAV_MAIN: NavItem[] = [
    { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
  ];

  const NAV_MODULES: NavItem[] = [
    { key: 'users',      href: '/dashboard/users',      icon: Users,      label: t('nav.users') },
    { key: 'employees',  href: '/dashboard/employees',  icon: UserCheck,  label: t('nav.employees') },
    { key: 'finanzas',   href: '/dashboard/finanzas',   icon: Banknote,   label: t('nav.finance') },
    { key: 'metricas',   href: '/dashboard/metricas',   icon: BarChart3,  label: t('nav.metrics') },
  ];

  const NAV_INTELLIGENCE: NavItem[] = [
    { key: 'ai-agents', href: '/dashboard/ai-agents', icon: Bot, label: t('nav.aiAgents') },
  ];

  const NAV_SYSTEM: NavItem[] = [
    { key: 'settings', href: '/dashboard/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-drawer bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-drawer flex h-full w-[240px] flex-col bg-bg-1 border-r border-border transition-transform duration-400 ease-out-expo',
          'md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-brand shadow-glow">
            <span className="text-xs font-extrabold text-white tracking-widest">LM</span>
          </div>
          <div>
            <p className="text-small font-extrabold tracking-tight text-text-1">LM Super Admin</p>
            <p className="text-tiny text-text-3 uppercase tracking-wider">Precision Medical</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-text-3 hover:text-text-2 md:hidden"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <NavGroup items={NAV_MAIN} pathname={pathname} />

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.modules') as string}
            </p>
            <NavGroup items={NAV_MODULES} pathname={pathname} />
          </div>

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.inteligencia') as string}
            </p>
            <NavGroup items={NAV_INTELLIGENCE} pathname={pathname} />
          </div>

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.system') as string}
            </p>
            <NavGroup items={NAV_SYSTEM} pathname={pathname} />
          </div>
        </nav>

      </aside>
    </>
  );
}

function NavGroup({ items, pathname }: { items: NavItem[]; pathname: string }): React.ReactElement {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isActive =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const isComingSoon = (item.phase ?? 1) > 1;

        return (
          <li key={item.key}>
            {isComingSoon ? (
              <span
                className="relative flex items-center gap-3 rounded px-3 py-2 text-sm text-text-muted cursor-not-allowed opacity-50"
                title={`Phase ${item.phase ?? ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </span>
            ) : (
              <Link
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 rounded px-3 py-2 text-sm transition-all duration-250 ease-out-expo',
                  isActive
                    ? 'bg-brand/10 text-brand font-semibold'
                    : 'text-text-2 hover:bg-surface hover:text-text-1',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-brand" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
