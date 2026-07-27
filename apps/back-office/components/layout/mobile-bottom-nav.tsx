'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Users, CalendarDays, ClipboardCheck, Menu, Sun } from 'lucide-react';
import { cn } from '@precision/ui';

const NAV_LINKS = [
  { href: '/dashboard',  icon: BarChart3,      key: 'dashboard',      exact: false },
  { href: '/patients',   icon: Users,          key: 'patients',       exact: false },
  { href: '/calendar',   icon: CalendarDays,   key: 'calendarShort',  exact: false },
  { href: '/admission',  icon: ClipboardCheck, key: 'admissionShort', exact: false },
] as const;

// Portal médico — identidad violet (Regla #5 · B.17–B.18)
const DOCTOR_NAV_LINKS = [
  { href: '/doctor',          icon: Sun,          key: 'myDay',         exact: true  },
  { href: '/doctor/calendar', icon: CalendarDays, key: 'calendarShort', exact: false },
  { href: '/doctor/patients', icon: Users,        key: 'myPatients',    exact: false },
  { href: '/doctor/stats',    icon: BarChart3,    key: 'stats',         exact: false },
] as const;

interface MobileBottomNavProps {
  onMenuClick?: () => void;
  variant?: 'admin' | 'doctor';
}

export function MobileBottomNav({ onMenuClick, variant = 'admin' }: MobileBottomNavProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');
  const isDoctor = variant === 'doctor';
  const links = isDoctor ? DOCTOR_NAV_LINKS : NAV_LINKS;

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
                active ? (isDoctor ? 'text-violet' : 'text-brand') : 'text-text-muted hover:text-text-2',
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
