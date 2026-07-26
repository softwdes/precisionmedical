'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Users, CalendarDays, ClipboardCheck, Menu } from 'lucide-react';
import { cn } from '@precision/ui';

const NAV_LINKS = [
  { href: '/dashboard',  icon: BarChart3,      key: 'dashboard'      },
  { href: '/patients',   icon: Users,          key: 'patients'       },
  { href: '/calendar',   icon: CalendarDays,   key: 'calendarShort'  },
  { href: '/admission',  icon: ClipboardCheck, key: 'admissionShort' },
] as const;

interface MobileBottomNavProps {
  onMenuClick?: () => void;
}

export function MobileBottomNav({ onMenuClick }: MobileBottomNavProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.nav');

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-bg-1 border-t border-border">
      <div className="flex items-center justify-around h-16">
        {NAV_LINKS.map(({ href, icon: Icon, key }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                active ? 'text-brand' : 'text-text-muted hover:text-text-2',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide">{t(key)}</span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-brand" />
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
