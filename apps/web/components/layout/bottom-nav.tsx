'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@precision/ui';
import { LayoutDashboard, UserCheck, Banknote, Clock, Menu } from 'lucide-react';

/**
 * Bottom navigation tipo app nativa para version movil.
 *
 * Solo se renderiza en `<md` (en desktop el sidebar lateral es la
 * navegacion principal). Tiene 5 slots fijos:
 *
 *   1. Dashboard
 *   2. Empleados (tab inicial)
 *   3. Finanzas
 *   4. Asistencia (atajo directo al sub-modulo mas usado en movil)
 *   5. Mas — abre el drawer del sidebar completo (Usuarios, IA, Config, etc.)
 *
 * El slot "Mas" resalta cuando el usuario esta en una ruta que NO
 * pertenece a los primeros 4, para indicar visualmente que la pagina
 * actual vive dentro del drawer.
 */
interface BottomNavProps {
  onMoreClick: () => void;
}

interface NavItem {
  key: string;
  href: string;
  icon: React.ElementType;
  label: string;
  /** Devuelve true cuando este item debe pintarse como activo. */
  isActive: (pathname: string, tab: string | null) => boolean;
}

export function BottomNav({ onMoreClick }: BottomNavProps): React.ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const tab = searchParams.get('tab');

  const items: NavItem[] = [
    {
      key: 'dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      label: t('nav.dashboard'),
      isActive: (p) => p === '/dashboard',
    },
    {
      key: 'employees',
      href: '/dashboard/employees',
      icon: UserCheck,
      label: t('nav.employees'),
      // Activo en /employees y sub-rutas, EXCEPTO cuando ?tab=asistencia
      // (eso pinta el slot de Asistencia).
      isActive: (p, qTab) =>
        (p === '/dashboard/employees' || p.startsWith('/dashboard/employees/')) &&
        qTab !== 'asistencia',
    },
    {
      key: 'finanzas',
      href: '/dashboard/finanzas',
      icon: Banknote,
      label: t('nav.finance'),
      isActive: (p) => p === '/dashboard/finanzas' || p.startsWith('/dashboard/finanzas/'),
    },
    {
      key: 'asistencia',
      href: '/dashboard/employees?tab=asistencia',
      icon: Clock,
      label: 'Asistencia',
      isActive: (p, qTab) => p === '/dashboard/employees' && qTab === 'asistencia',
    },
  ];

  // El boton "Mas" se resalta cuando estoy en una ruta que NO matchea
  // ninguno de los 4 anteriores — significa que la pagina actual vive
  // dentro del drawer (Usuarios, Agentes IA, Configuracion, etc.).
  const anyPrimaryActive = items.some((it) => it.isActive(pathname, tab));
  const moreActive = !anyPrimaryActive;

  return (
    <nav
      role="navigation"
      aria-label="Bottom navigation"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 md:hidden',
        'border-t border-border bg-bg-1/85 backdrop-blur-xl',
        // Safe-area iOS: empuja contenido arriba del home indicator.
        'pb-[env(safe-area-inset-bottom)]',
      )}
      style={{
        // Sutil glow superior — refuerza la separacion visual con el contenido.
        boxShadow: '0 -8px 24px -12px rgba(0, 0, 0, 0.35)',
      }}
    >
      <ul className="grid h-16 grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname, tab);
          return (
            <li key={item.key} className="flex">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full flex-col items-center justify-center gap-0.5 transition-all',
                  'active:scale-[0.92]',
                  active ? 'text-brand' : 'text-text-3 hover:text-text-2',
                )}
              >
                {/* Indicador superior animado para el item activo */}
                <span
                  className={cn(
                    'absolute top-0 h-[2px] rounded-b-full bg-brand transition-all duration-300 ease-out-expo',
                    active ? 'w-7 opacity-100' : 'w-0 opacity-0',
                  )}
                  style={{ boxShadow: active ? '0 0 8px rgba(99,102,241,0.55)' : 'none' }}
                />
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] transition-transform duration-200',
                    active ? 'scale-110' : 'group-hover:scale-105',
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span className={cn('text-[10px] font-medium leading-tight', active && 'font-semibold')}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}

        {/* Slot final: "Mas" — abre el drawer del sidebar completo */}
        <li className="flex">
          <button
            type="button"
            onClick={onMoreClick}
            aria-label="Abrir menu completo"
            className={cn(
              'group relative flex w-full flex-col items-center justify-center gap-0.5 transition-all',
              'active:scale-[0.92]',
              moreActive ? 'text-brand' : 'text-text-3 hover:text-text-2',
            )}
          >
            <span
              className={cn(
                'absolute top-0 h-[2px] rounded-b-full bg-brand transition-all duration-300 ease-out-expo',
                moreActive ? 'w-7 opacity-100' : 'w-0 opacity-0',
              )}
              style={{ boxShadow: moreActive ? '0 0 8px rgba(99,102,241,0.55)' : 'none' }}
            />
            <Menu
              className={cn(
                'h-[18px] w-[18px] transition-transform duration-200',
                moreActive ? 'scale-110' : 'group-hover:scale-105',
              )}
              strokeWidth={moreActive ? 2.4 : 2}
            />
            <span className={cn('text-[10px] font-medium leading-tight', moreActive && 'font-semibold')}>
              Más
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
