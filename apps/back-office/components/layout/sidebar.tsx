'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { cn } from '@precision/ui';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  mockup?: string;
  disabled?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'Catálogos',
    items: [
      { href: '/admin/specialties', icon: Stethoscope, label: 'Especialidades', mockup: 'B.36' },
      { href: '/admin/lawyers',     icon: Scale,       label: 'Bufetes',        mockup: 'B.30' },
      { href: '/admin/insurances',  icon: ShieldCheck, label: 'Aseguradoras',   mockup: 'B.32' },
      { href: '/admin/services',    icon: DollarSign,  label: 'Servicios CPT',  mockup: 'B.33' },
      { href: '/admin/diagnoses',   icon: FileText,    label: 'Diagnósticos',   mockup: 'B.35', disabled: true },
    ],
  },
  {
    title: 'Workspaces',
    items: [
      { href: '/front-office', icon: Building2,  label: 'Front Office',     mockup: 'B.1–B.4',   disabled: true },
      { href: '/intake',       icon: Phone,      label: 'Intake (Edson)',   mockup: 'B.12–B.13', disabled: true },
      { href: '/billing',      icon: Briefcase,  label: 'Billing (Brunella)', mockup: 'B.25–B.28', disabled: true },
      { href: '/dashboard',    icon: BarChart3,  label: 'Dashboard',        mockup: 'B.29',      disabled: true },
    ],
  },
  {
    title: 'Búsqueda',
    items: [
      { href: '/search', icon: Search, label: 'Patient Search ⌘K', mockup: 'B.34', disabled: true },
    ],
  },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-full w-[240px] flex-col bg-bg-1 border-r border-border">
      {/* Brand */}
      <Link href="/admin/specialties" className="flex items-center gap-3 px-5 py-5 border-b border-border hover:bg-white/2 transition-colors">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-gradient-brand shadow-glow">
          <span className="text-white font-bold text-sm">LM</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-white font-bold text-sm leading-tight truncate">LienMaster v3</span>
          <span className="text-text-muted text-[10px] uppercase tracking-wider truncate">Back Office</span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        <NavItemLink
          href="/dashboard-home"
          icon={LayoutDashboard}
          label="Dashboard"
          active={pathname === '/dashboard-home'}
          disabled
        />

        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold px-3 mb-2">
              {section.title}
            </div>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  mockup={item.mockup}
                  active={pathname === item.href || pathname.startsWith(item.href + '/')}
                  disabled={item.disabled}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <div className="text-text-muted text-[10px] leading-relaxed">
          <div className="text-text-2 font-semibold mb-1">Phoenix · Phase 1A</div>
          <div>Catálogos en construcción</div>
          <div className="mt-2 text-emerald flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
            phoenix-dev · local
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── NavItem ────────────────────────────────────────────────────────────────

interface NavItemLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  mockup?: string;
  active?: boolean;
  disabled?: boolean;
}

function NavItemLink({ href, icon: Icon, label, mockup, active, disabled }: NavItemLinkProps): React.ReactElement {
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
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-all group',
          active
            ? 'bg-gradient-brand text-white shadow-glow font-semibold'
            : 'text-text-2 hover:text-white hover:bg-white/5',
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
