'use client';

/**
 * El índice izquierdo de Configuración.
 *
 * Tres bloques, en el orden de Medusa: Plantillas (la nota completa), los
 * títulos de la nota (cada uno abre SUS snippets) y Laboratorios. Los rótulos
 * de las secciones son las mismas claves `sec_*` que usan la plantilla y la
 * nota: la misma sección se llama igual en las tres pantallas.
 *
 * En pantallas angostas el índice se acuesta y se desplaza horizontal: un menú
 * vertical de nueve ítems arriba del contenido empujaba la tabla fuera de la
 * vista.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, FlaskConical, Scissors } from 'lucide-react';
import { cn } from '@precision/ui';
import { SNIPPET_SECTIONS } from '@/lib/snippet-sections';

export function SettingsIndex({ showTemplates, showLabs }: { showTemplates: boolean; showLabs: boolean }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const pathname = usePathname();

  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t('settingsTitle')}
      className="w-full lg:w-[232px] lg:shrink-0 lg:sticky lg:top-4 rounded-lg bg-bg-1 p-2
                 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible"
    >
      {showTemplates && (
        <>
          <IndexLink href="/doctor/settings/templates" active={isActive('/doctor/settings/templates')} icon={FileText}>
            {t('settingsIdxTemplates')}
          </IndexLink>

          {/* Snippets por sección: un ítem por título de la nota, como el menú
              izquierdo de Medusa (HPI, ROS Other, PE Other, Assessment, Plan…). */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            <Scissors className="w-3 h-3" />
            {t('settingsIdxSnippets')}
          </div>
          {SNIPPET_SECTIONS.map((key) => {
            const href = `/doctor/settings/snippets/${key}`;
            return (
              <IndexLink key={key} href={href} active={isActive(href)} nested>
                {t(`sec_${key}`)}
              </IndexLink>
            );
          })}
        </>
      )}

      {showLabs && (
        <>
          {showTemplates && <div className="hidden lg:block h-px bg-border my-1.5 mx-2" />}
          <IndexLink href="/doctor/settings/labs" active={isActive('/doctor/settings/labs')} icon={FlaskConical}>
            {t('settingsIdxLabs')}
          </IndexLink>
        </>
      )}
    </nav>
  );
}

function IndexLink({
  href, active, icon: Icon, nested = false, children,
}: {
  href: string;
  active: boolean;
  icon?: React.ElementType;
  nested?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] whitespace-nowrap transition-colors shrink-0',
        nested && 'lg:pl-5',
        active
          ? 'bg-violet/15 text-violet-text font-semibold'
          : 'text-text-2 hover:text-text-1 hover:bg-white/5',
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
    </Link>
  );
}
