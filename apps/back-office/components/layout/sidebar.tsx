'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Settings,
  Phone,
  Briefcase,
  BarChart3,
  Lock,
  X,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Users,
  Scale,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@precision/ui';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  mockup?: string;
  disabled?: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    titleKey: '',
    items: [
      { href: '/dashboard',  icon: BarChart3,      labelKey: 'dashboard',  mockup: 'B.29'        },
      { href: '/patients',   icon: Users,          labelKey: 'patients',   mockup: 'B.4'         },
      { href: '/calendar',   icon: CalendarDays,   labelKey: 'calendar',   mockup: 'B.10–B.11'  },
      { href: '/admission',  icon: ClipboardCheck, labelKey: 'admission',  mockup: 'B.14–B.15'  },
      { href: '/admin/lawyers', icon: Scale,       labelKey: 'lawyers',    mockup: 'B.30–B.31'  },
      { href: '/edson',      icon: ClipboardList,  labelKey: 'edson',      mockup: 'B.12–B.13/B.23–B.24' },
      { href: '/intake',     icon: Phone,          labelKey: 'intake',     mockup: 'B.12–B.13'  },
      { href: '/billing',    icon: Briefcase,      labelKey: 'billing',    mockup: 'B.25–B.28'  },
      { href: '/settings',   icon: Settings,       labelKey: 'settings',   mockup: 'B.36+'       },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose, collapsed = false, onCollapsedChange }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-full flex-col bg-bg-1 border-r border-border',
        'transition-all duration-300 ease-out',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center border-b border-border', collapsed ? 'justify-center px-0 py-4' : 'justify-between px-5 py-5')}>
        {!collapsed && (
          <Link href="/dashboard" onClick={onMobileClose} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div suppressHydrationWarning className="flex h-9 w-9 items-center justify-center rounded-[10px] shrink-0" style={{ background: 'linear-gradient(135deg,#1E40AF 0%,#2563EB 50%,#38BDF8 100%)', boxShadow: '0 0 16px rgba(37,99,235,0.55)' }}>
              <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95"/>
                <rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95"/>
                <path d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-text-1 font-bold text-sm leading-tight truncate">Precision Medical</span>
              <span className="text-text-muted text-[10px] uppercase tracking-wider truncate">LienMaster v3</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link suppressHydrationWarning href="/dashboard" onClick={onMobileClose} className="flex h-9 w-9 items-center justify-center rounded-[10px] hover:opacity-80 transition-opacity" style={{ background: 'linear-gradient(135deg,#1E40AF 0%,#2563EB 50%,#38BDF8 100%)', boxShadow: '0 0 16px rgba(37,99,235,0.55)' }}>
            <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95"/>
              <rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95"/>
              <path d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </Link>
        )}
        {/* Close button mobile only */}
        {!collapsed && (
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden w-8 h-8 rounded-md hover:bg-white/5 flex items-center justify-center text-text-muted"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-1', collapsed ? 'px-1.5' : 'px-3 pt-5 space-y-6')}>
        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            {section.titleKey && !collapsed && (
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold px-3 mb-2">
                {t(section.titleKey)}
              </div>
            )}
            <ul className={cn(collapsed ? 'space-y-1' : 'space-y-1')}>
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  mockup={item.mockup}
                  active={pathname === item.href || pathname.startsWith(item.href + '/')}
                  disabled={item.disabled}
                  onClick={onMobileClose}
                  collapsed={collapsed}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-border', collapsed ? 'px-1.5 py-3' : 'px-5 py-4')}>
        {!collapsed ? (
          <div className="text-text-muted text-[10px] leading-relaxed">
            <div className="text-text-2 font-semibold mb-1">{t('footerStatus')}</div>
            <div className="mt-2 text-emerald flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
              phoenix-dev · local
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          </div>
        )}
        {/* Collapse toggle — desktop only */}
        {onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn(
              'hidden md:flex w-full items-center justify-center rounded-md hover:bg-white/5 text-text-muted hover:text-text-2 transition-colors mt-2 py-1.5',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>
    </aside>
  );
}

interface NavItemLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  mockup?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}

function NavItemLink({ href, icon: Icon, label, mockup, active, disabled, onClick, collapsed }: NavItemLinkProps): React.ReactElement {
  if (disabled) {
    return (
      <li>
        <div
          className={cn(
            'flex items-center rounded-md text-text-muted text-[13px] cursor-not-allowed group',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
          )}
          title={collapsed ? label : undefined}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {!collapsed && <><span className="flex-1 truncate">{label}</span><Lock className="w-3 h-3 shrink-0 opacity-60" /></>}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        title={collapsed ? label : undefined}
        className={cn(
          'flex items-center rounded-md text-[13px] transition-all group',
          collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
          active
            ? 'bg-gradient-brand text-white shadow-glow font-semibold'
            : 'text-text-2 hover:text-text-1 hover:bg-white/5',
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            {mockup && !active && (
              <span className="text-text-muted text-[9px] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                {mockup}
              </span>
            )}
          </>
        )}
      </Link>
    </li>
  );
}
