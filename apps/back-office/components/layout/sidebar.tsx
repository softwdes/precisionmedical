'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Stethoscope,
  Scale,
  ShieldCheck,
  DollarSign,
  FileText,
  Building2,
  Phone,
  Briefcase,
  BarChart3,
  Search,
  Lock,
  X,
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
    titleKey: 'catalogs',
    items: [
      { href: '/admin/specialties', icon: Stethoscope, labelKey: 'specialties', mockup: 'B.36' },
      { href: '/admin/lawyers',     icon: Scale,       labelKey: 'lawyers',      mockup: 'B.30' },
      { href: '/admin/insurances',  icon: ShieldCheck, labelKey: 'insurances',   mockup: 'B.32' },
      { href: '/admin/services',    icon: DollarSign,  labelKey: 'services',     mockup: 'B.33' },
      { href: '/admin/diagnoses',   icon: FileText,    labelKey: 'diagnoses',    mockup: 'B.35' },
    ],
  },
  {
    titleKey: 'workspaces',
    items: [
      { href: '/front-office', icon: Building2,  labelKey: 'frontOffice', mockup: 'B.1–B.4'   },
      { href: '/intake',       icon: Phone,      labelKey: 'intake',      mockup: 'B.12–B.13', disabled: true },
      { href: '/billing',      icon: Briefcase,  labelKey: 'billing',     mockup: 'B.25–B.28', disabled: true },
      { href: '/dashboard',    icon: BarChart3,  labelKey: 'dashboard',   mockup: 'B.29',      disabled: true },
    ],
  },
  {
    titleKey: 'globalSearch',
    items: [
      { href: '/search', icon: Search, labelKey: 'globalSearch', mockup: 'B.34 · ⌘K', disabled: true },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-full w-[240px] flex-col bg-bg-1 border-r border-border',
        'transition-transform duration-300 ease-out',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border">
        <Link href="/admin/specialties" onClick={onMobileClose} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-gradient-brand shadow-glow">
            <span className="text-white font-bold text-sm">LM</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-text-1 font-bold text-sm leading-tight truncate">LienMaster v3</span>
            <span className="text-text-muted text-[10px] uppercase tracking-wider truncate">Back Office</span>
          </div>
        </Link>
        {/* Close button mobile only */}
        <button
          type="button"
          onClick={onMobileClose}
          className="md:hidden w-8 h-8 rounded-md hover:bg-white/5 flex items-center justify-center text-text-muted"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        <NavItemLink
          href="/dashboard-home"
          icon={LayoutDashboard}
          label="Dashboard"
          active={pathname === '/dashboard-home'}
          disabled
          onClick={onMobileClose}
        />

        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold px-3 mb-2">
              {t(section.titleKey)}
            </div>
            <ul className="space-y-1">
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
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <div className="text-text-muted text-[10px] leading-relaxed">
          <div className="text-text-2 font-semibold mb-1">{t('footerStatus')}</div>
          <div className="mt-2 text-emerald flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
            phoenix-dev · local
          </div>
        </div>
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
}

function NavItemLink({ href, icon: Icon, label, mockup, active, disabled, onClick }: NavItemLinkProps): React.ReactElement {
  if (disabled) {
    return (
      <li>
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-text-muted text-[13px] cursor-not-allowed group">
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          <Lock className="w-3 h-3 shrink-0 opacity-60" />
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-all group',
          active
            ? 'bg-gradient-brand text-white shadow-glow font-semibold'
            : 'text-text-2 hover:text-text-1 hover:bg-white/5',
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {mockup && !active && (
          <span className="text-text-muted text-[9px] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
            {mockup}
          </span>
        )}
      </Link>
    </li>
  );
}
