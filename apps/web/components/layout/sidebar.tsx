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
  Lock,
} from 'lucide-react';
import { useRole } from '@/contexts/role-context';
import { can, type Role, type LmModule } from '@/lib/permissions';

interface NavItem {
  key: string;
  href: string;
  icon: React.ElementType;
  label: string;
  module: LmModule;
  /** When true, item is shown but not clickable (e.g. module not yet implemented). */
  disabled?: boolean;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const role = useRole();

  const NAV_MAIN: NavItem[] = [
    { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), module: 'dashboard' },
  ];

  const NAV_MODULES: NavItem[] = [
    { key: 'users',     href: '/dashboard/users',     icon: Users,     label: t('nav.users'),     module: 'usuarios'  },
    { key: 'employees', href: '/dashboard/employees', icon: UserCheck, label: t('nav.employees'), module: 'empleados' },
    { key: 'finanzas',  href: '/dashboard/finanzas',  icon: Banknote,  label: t('nav.finance'),   module: 'finanzas'  },
    { key: 'metricas',  href: '/dashboard/metricas',  icon: BarChart3, label: t('nav.metrics'),   module: 'metricas' },
  ];

  const NAV_INTELLIGENCE: NavItem[] = [
    { key: 'ai-agents', href: '/dashboard/ai-agents', icon: Bot, label: t('nav.aiAgents'), module: 'agentes_ia' },
  ];

  const NAV_SYSTEM: NavItem[] = [
    { key: 'settings', href: '/dashboard/settings', icon: Settings, label: t('nav.settings'), module: 'configuracion' },
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
          {/*
            El MISMO logo que el back-office, el portal médico y el legal: la
            cruz con el electro, dibujada en SVG.

            Acá había un cuadradito con las letras "LM" escritas como texto —
            el Admin nunca tuvo archivo de logo (Erick, 2026-09-12: *"el logo
            sigue siendo LM y el nuevo es distinto para back office, provider,
            etc"*). Era la única de las cuatro apps con marca propia.

            Va en SVG y no como imagen por la misma razón que en las otras: se
            pinta nítido en cualquier tamaño y el color del electro cambia por
            portal sin necesitar un archivo por variante.
          */}
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] shrink-0 bg-gradient-brand shadow-glow">
            <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95" />
              <rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95" />
              <path
                d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18"
                stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
            </svg>
          </div>
          <div className="min-w-0">
            {/* El nombre de la EMPRESA arriba y el portal debajo — el mismo
                orden que las otras tres apps, para que se lean como familia. */}
            <p className="text-small font-extrabold tracking-tight text-text-1 truncate">Precision Medical</p>
            <p className="text-tiny text-text-3 uppercase tracking-wider truncate">Super Admin</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-text-3 hover:text-text-2 md:hidden"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation — all items visible; lack of access shown as disabled state */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <NavGroup items={NAV_MAIN} pathname={pathname} role={role} />

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.modules') as string}
            </p>
            <NavGroup items={NAV_MODULES} pathname={pathname} role={role} />
          </div>

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.inteligencia') as string}
            </p>
            <NavGroup items={NAV_INTELLIGENCE} pathname={pathname} role={role} />
          </div>

          <div className="mt-4">
            <p className="mb-1 px-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
              {t('nav.system') as string}
            </p>
            <NavGroup items={NAV_SYSTEM} pathname={pathname} role={role} />
          </div>
        </nav>
      </aside>
    </>
  );
}

function NavGroup({ items, pathname, role }: { items: NavItem[]; pathname: string; role: Role }): React.ReactElement {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const hasAccess = can(role, item.module);
        const isBlocked = item.disabled || !hasAccess;
        const blockReason = item.disabled
          ? 'Próximamente — módulo en desarrollo'
          : 'Sin acceso a este módulo para tu rol';

        if (isBlocked) {
          return (
            <li key={item.key}>
              <div
                className="relative flex items-center gap-3 rounded px-3 py-2 text-sm text-text-muted opacity-40 cursor-not-allowed select-none"
                title={blockReason}
                aria-disabled="true"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <Lock className="h-3 w-3 shrink-0 opacity-70" />
              </div>
            </li>
          );
        }

        const isActive =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded px-3 py-2 text-sm transition-all duration-250 ease-out-expo',
                isActive
                  ? 'bg-brand/10 text-brand-text font-semibold'
                  : 'text-text-2 hover:bg-surface hover:text-text-1',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-brand" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
