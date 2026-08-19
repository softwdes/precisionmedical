'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Settings,
  Briefcase,
  BarChart3,
  Lock,
  X,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Users,
  Scale,
  Sun,
  FileText,
  FlaskConical,
  Pill,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@precision/ui';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  mockup?: string;
  disabled?: boolean;
  /** Solo activo con match exacto (para items "home" como /doctor) */
  exact?: boolean;
  /** Llave del módulo en roles_config.pm_clinic_modules (checks por rol) */
  moduleKey?: string;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    titleKey: '',
    items: [
      { href: '/dashboard',  icon: BarChart3,      labelKey: 'dashboard',  mockup: 'B.29',       moduleKey: 'dashboard' },
      { href: '/patients',   icon: Users,          labelKey: 'patients',   mockup: 'B.4',        moduleKey: 'patients'  },
      { href: '/calendar',   icon: CalendarDays,   labelKey: 'calendar',   mockup: 'B.10–B.11', moduleKey: 'calendar'  },
      { href: '/admission',  icon: ClipboardCheck, labelKey: 'admission',  mockup: 'B.14–B.15', moduleKey: 'admission' },
      { href: '/admin/lawyers', icon: Scale,       labelKey: 'lawyers',    mockup: 'B.30–B.31', moduleKey: 'externals' },
      // "Intake (Edson)" se retiró: la vista de tracking de /edson lo reemplaza.
      // Las rutas /intake/* siguen vivas (verify-pip sella `pipVerifiedAt`), pero
      // ya no tienen entrada en el menú. Ver docs/plan-vista-edson.md §6.
      { href: '/edson',      icon: ClipboardList,  labelKey: 'edson',      mockup: 'B.12–B.13/B.23–B.24', moduleKey: 'edson' },
      { href: '/billing',    icon: Briefcase,      labelKey: 'billing',    mockup: 'B.25–B.28', moduleKey: 'billing'   },
      { href: '/settings',   icon: Settings,       labelKey: 'settings',   mockup: 'B.36+',      moduleKey: 'settings'  },
    ],
  },
];

/**
 * Puerta al portal médico desde el menú administrativo. No lleva `moduleKey`:
 * no se filtra con el resto de los menús (que se ven salvo `false`) sino con la
 * capacidad `canViewAsDoctor`, que exige un sí explícito.
 */
const DOCTOR_PORTAL_ITEM: NavItem = {
  href: '/doctor', icon: Stethoscope, labelKey: 'doctorPortal', mockup: 'B.17–B.18', exact: true,
};

// Portal médico — identidad violet (Regla #5 · B.17–B.18)
const DOCTOR_SECTIONS: NavSection[] = [
  {
    titleKey: '',
    items: [
      { href: '/doctor',           icon: Sun,          labelKey: 'myDay',      mockup: 'B.17',   exact: true },
      { href: '/doctor/calendar',  icon: CalendarDays, labelKey: 'calendar'                                  },
      { href: '/doctor/patients',  icon: Users,        labelKey: 'myPatients'                                },
      { href: '/doctor/prescriptions', icon: Pill,     labelKey: 'prescriptions'                             },
      { href: '/doctor/stats',     icon: BarChart3,    labelKey: 'stats'                                     },
      { href: '/doctor/templates', icon: FileText,     labelKey: 'templates',  mockup: 'B.17.7'              },
      { href: '/doctor/catalog',   icon: FlaskConical, labelKey: 'catalog'                                   },
    ],
  },
];

/**
 * Portal Legal — mismo acento `brand` que el back-office (Erick: "todo igual que
 * los demás módulos"). Los `moduleKey` son las llaves de `AttorneyMenu`, así que
 * el filtrado por rol del despacho reusa el mismo mecanismo `allowedModules` que
 * ya gobierna los menús del staff interno.
 */
const ATTORNEY_SECTIONS: NavSection[] = [
  {
    titleKey: '',
    items: [
      { href: '/attorney',              icon: BarChart3,    labelKey: 'attorneyPanel',        moduleKey: 'panel', exact: true },
      { href: '/attorney/cases',        icon: Briefcase,    labelKey: 'attorneyCases',        moduleKey: 'cases'        },
      { href: '/attorney/users',        icon: Users,        labelKey: 'attorneyUsers',        moduleKey: 'users'        },
      { href: '/attorney/appointments', icon: CalendarDays, labelKey: 'attorneyAppointments', moduleKey: 'appointments' },
    ],
  },
];

export type ShellVariant = 'admin' | 'doctor' | 'attorney';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
  variant?: ShellVariant;
  /** Checks por menú del rol. null = ve todo. */
  allowedModules?: Record<string, boolean> | null;
  /** Capacidad "ver como doctor" — agrega el Portal Médico al menú administrativo. */
  canViewAsDoctor?: boolean;
  /** Bloque libre entre el menú y el footer. Lo usa el Portal Legal para la
   *  tarjeta de oficina; se oculta con la barra colapsada, donde no hay ancho. */
  belowNav?: React.ReactNode;
}

export function Sidebar({ mobileOpen = false, onMobileClose, collapsed = false, onCollapsedChange, variant = 'admin', allowedModules = null, canViewAsDoctor = false, belowNav = null }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');

  const isDoctor = variant === 'doctor';
  const isAttorney = variant === 'attorney';
  const baseSections = isDoctor ? DOCTOR_SECTIONS : isAttorney ? ATTORNEY_SECTIONS : SECTIONS;
  // Checks por menú del rol: sin mapa → todo visible; con mapa → solo los marcados
  const visibleSections = allowedModules
    ? baseSections.map((s) => ({
        ...s,
        items: s.items.filter((i) => !i.moduleKey || allowedModules[i.moduleKey] !== false),
      }))
    : baseSections;
  // El Portal Médico cierra el menú administrativo. Se agrega a la última sección
  // en vez de abrir una nueva: la lista se renderiza con `titleKey` como key de
  // React y todas las secciones de acá comparten el título vacío.
  const sections = !isDoctor && !isAttorney && canViewAsDoctor
    ? visibleSections.map((s, i) =>
        i === visibleSections.length - 1 ? { ...s, items: [...s.items, DOCTOR_PORTAL_ITEM] } : s,
      )
    : visibleSections;
  const homeHref = isDoctor ? '/doctor' : isAttorney ? '/attorney' : '/dashboard';
  const logoGradient = isDoctor
    ? 'linear-gradient(135deg,#7C3AED 0%,#8B5CF6 50%,#A78BFA 100%)'
    : 'linear-gradient(135deg,#1E40AF 0%,#2563EB 50%,#38BDF8 100%)';
  const logoShadow = isDoctor ? '0 0 16px rgba(139,92,246,0.55)' : '0 0 16px rgba(37,99,235,0.55)';

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
      <div className={cn('relative flex items-center border-b border-border', collapsed ? 'justify-center px-0 py-4' : 'justify-between px-5 py-5')}>
        {!collapsed && (
          <Link href={homeHref} onClick={onMobileClose} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div suppressHydrationWarning className="flex h-9 w-9 items-center justify-center rounded-[10px] shrink-0" style={{ background: logoGradient, boxShadow: logoShadow }}>
              <svg suppressHydrationWarning width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect suppressHydrationWarning x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95"/>
                <rect suppressHydrationWarning x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95"/>
                <path suppressHydrationWarning d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke={isDoctor ? '#7C3AED' : '#1E40AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-text-1 font-bold text-sm leading-tight truncate">Precision Medical</span>
              <span className={cn('text-[10px] uppercase tracking-wider truncate', isDoctor ? 'text-violet-text font-semibold' : 'text-text-muted')}>
                {isDoctor ? t('doctorPortal') : isAttorney ? t('attorneyPortal') : 'LienMaster v3'}
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link suppressHydrationWarning href={homeHref} onClick={onMobileClose} className="flex h-9 w-9 items-center justify-center rounded-[10px] hover:opacity-80 transition-opacity" style={{ background: logoGradient, boxShadow: logoShadow }}>
            <svg suppressHydrationWarning width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect suppressHydrationWarning x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95"/>
              <rect suppressHydrationWarning x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95"/>
              <path suppressHydrationWarning d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke={isDoctor ? '#7C3AED' : '#1E40AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </Link>
        )}
        {/*
          * El boton de colapsar ya NO vive acá: se movio a la barra superior.
          * Dentro de una barra de 60px peleaba con el logo y no se veia — el
          * control para expandir algo no puede vivir dentro de lo colapsado.
          */}

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
        {sections.map((section) => (
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
                  active={item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'))}
                  disabled={item.disabled}
                  onClick={onMobileClose}
                  collapsed={collapsed}
                  accent={isDoctor ? 'violet' : 'brand'}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {belowNav && !collapsed && (
        <div className="border-t border-border pt-3 max-h-[45vh] overflow-y-auto shrink-0">
          {belowNav}
        </div>
      )}

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
  accent?: 'brand' | 'violet';
}

function NavItemLink({ href, icon: Icon, label, mockup, active, disabled, onClick, collapsed, accent = 'brand' }: NavItemLinkProps): React.ReactElement {
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
        suppressHydrationWarning
        className={cn(
          'flex items-center rounded-md text-[13px] transition-all group',
          collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
          active
            ? cn('text-white font-semibold', accent === 'brand' && 'bg-gradient-brand shadow-glow')
            : 'text-text-2 hover:text-text-1 hover:bg-white/5',
        )}
        style={active && accent === 'violet'
          ? { background: 'linear-gradient(135deg,#7C3AED,#A78BFA)', boxShadow: '0 0 18px rgba(139,92,246,0.35)' }
          : undefined}
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
