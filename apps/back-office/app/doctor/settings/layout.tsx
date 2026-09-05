import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getDoctorMenus } from '@/lib/get-session-provider';
import { seesDoctorMenu, seesDoctorSettings } from '@/lib/doctor-menu-modules';
import { SettingsIndex } from './settings-index';

/**
 * Portal Médico · Configuración — layout con índice izquierdo.
 *
 * Copia la forma de "My Settings" de Medusa: a la izquierda Plantillas, los
 * seis títulos de la nota (cada uno con sus snippets) y Laboratorios; a la
 * derecha la pantalla elegida. Ver docs/plan-settings-portal-snippets.md §3.
 *
 * Qué ítems se listan lo decide el mismo mapa de menús que el sidebar
 * (`clinicModules`, llaves `doctor:*`): Plantillas y Snippets van con
 * `templates`, Laboratorios con `catalog`. Sin ninguno visible la persona no
 * tiene nada que hacer acá y se la manda a su portal — el middleware ya cerró
 * cada ruta hija, esto evita el índice vacío.
 */
export default async function DoctorSettingsLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  const mods = await getDoctorMenus();
  if (!seesDoctorSettings(mods)) redirect('/doctor');

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <SettingsIndex
        showTemplates={seesDoctorMenu(mods, 'templates')}
        showLabs={seesDoctorMenu(mods, 'catalog')}
      />
      <div className="flex-1 min-w-0 w-full">{children}</div>
    </div>
  );
}
