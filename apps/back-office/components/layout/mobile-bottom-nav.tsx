'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Users, CalendarDays, ClipboardCheck, Menu, Sun, Briefcase, Sparkles, Mail } from 'lucide-react';
import { cn } from '@precision/ui';

const NAV_LINKS = [
  { href: '/dashboard',  icon: BarChart3,      key: 'dashboard',      exact: false, moduleKey: 'dashboard' },
  { href: '/patients',   icon: Users,          key: 'patients',       exact: false, moduleKey: 'patients'  },
  { href: '/calendar',   icon: CalendarDays,   key: 'calendarShort',  exact: false, moduleKey: 'calendar'  },
  { href: '/admission',  icon: ClipboardCheck, key: 'admissionShort', exact: false, moduleKey: 'admission' },
] as const;

// Portal médico — identidad violet (Regla #5 · B.17–B.18)
const DOCTOR_NAV_LINKS = [
  { href: '/doctor',          icon: Sun,          key: 'myDay',         exact: true  },
  { href: '/doctor/calendar', icon: CalendarDays, key: 'calendarShort', exact: false },
  { href: '/doctor/patients', icon: Users,        key: 'myPatients',    exact: false },
  { href: '/doctor/stats',    icon: BarChart3,    key: 'stats',         exact: false },
] as const;

// Portal Legal — mismo acento brand que el back-office
//
// Cuatro links y el menú: con cinco, cada slot baja de 63px y "Appointments" no
// entra en una línea. Panel salió (Vigía lo reemplazó, 2026-09-08) y entró
// Mensajes. El referido NO va acá: en el teléfono es el botón flotante
// (`ReferralFab`), siempre visible sobre esta barra; la lista de referidos queda
// a un tap en el cajón del menú, primera del orden del sidebar.
const ATTORNEY_NAV_LINKS = [
  { href: '/attorney/vigia',        icon: Sparkles,     key: 'attorneyVigia',        exact: false, moduleKey: 'vigia'        },
  { href: '/attorney/cases',        icon: Briefcase,    key: 'attorneyCases',        exact: false, moduleKey: 'cases'        },
  { href: '/attorney/messages',     icon: Mail,         key: 'attorneyMessages',     exact: false, moduleKey: 'messages'     },
  { href: '/attorney/appointments', icon: CalendarDays, key: 'attorneyAppointments', exact: false, moduleKey: 'appointments' },
] as const;

interface MobileBottomNavProps {
  onMenuClick?: () => void;
  variant?: 'admin' | 'doctor' | 'attorney';
  /** Checks por menú del rol. null = ve todo. */
  allowedModules?: Record<string, boolean> | null;
}

export function MobileBottomNav({ onMenuClick, variant = 'admin', allowedModules = null }: MobileBottomNavProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');
  const isDoctor = variant === 'doctor';
  const baseLinks = isDoctor ? DOCTOR_NAV_LINKS : variant === 'attorney' ? ATTORNEY_NAV_LINKS : NAV_LINKS;
  const links = allowedModules
    ? baseLinks.filter((l) => !('moduleKey' in l) || allowedModules[(l as { moduleKey: string }).moduleKey] !== false)
    : baseLinks;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-bg-1 border-t border-border">
      <div className="flex items-center justify-around h-16">
        {links.map(({ href, icon: Icon, key, exact }) => {
          const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                active ? (isDoctor ? 'text-violet-text' : 'text-brand-text') : 'text-text-muted hover:text-text-2',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide">{t(key)}</span>
              {active && (
                <span className={cn('absolute bottom-0 w-8 h-0.5 rounded-full', isDoctor ? 'bg-violet' : 'bg-brand')} />
              )}
            </Link>
          );
        })}

        {/* Menú — abre sidebar drawer */}
        <button
          type="button"
          onClick={onMenuClick}
          className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-text-muted hover:text-text-2 transition-colors"
          aria-label={t('menu')}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-wide">{t('menu')}</span>
        </button>
      </div>
    </nav>
  );
}
