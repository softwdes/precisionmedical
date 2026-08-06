'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { BootAnimation } from './boot-animation';
import { NavigationProgressProvider } from './navigation-progress';
import { MobileBottomNav } from './mobile-bottom-nav';
import { ToastProvider } from '@/components/ui-phoenix';
import { useActivityHeartbeat } from '@/lib/use-activity-heartbeat';

// Wrapper client component que maneja el state del mobile drawer.
// Desktop (md+): sidebar siempre visible · Mobile: drawer con hamburger.
//
// Envuelve TODO en:
//  - BootAnimation: splash 1.2s al primer mount + fade-in al contenido
//  - NavigationProgressProvider: barra global de progress arriba

interface AdminShellProps {
  children:      React.ReactNode;
  userName?:     string;
  userRole?:     string;
  userInitials?: string;
  userEmail?:    string;
  /** 'doctor' activa el portal médico: sidebar/bottom-nav violet con rutas /doctor/* */
  variant?:      'admin' | 'doctor';
  /** Checks por menú del rol (roles_config.pm_clinic_modules). null = ve todo. */
  allowedModules?: Record<string, boolean> | null;
}

export function AdminShell({
  children,
  userName     = 'Usuario',
  userRole     = '',
  userInitials = 'U',
  userEmail    = '',
  variant      = 'admin',
  allowedModules = null,
}: AdminShellProps): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Tiempo de uso activo (métricas por empleado) — acá cubre admin Y doctor,
  // los dos layouts montan este shell.
  useActivityHeartbeat();

  useEffect(() => {
    if (localStorage.getItem('pm_sidebar_collapsed') === 'true') setCollapsed(true);
  }, []);

  function handleCollapsedChange(c: boolean) {
    setCollapsed(c);
    localStorage.setItem('pm_sidebar_collapsed', String(c));
  }

  return (
    <BootAnimation>
      <NavigationProgressProvider>
        <ToastProvider>
        <div className="min-h-screen bg-bg-0">
          <Sidebar
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
            collapsed={collapsed}
            onCollapsedChange={handleCollapsedChange}
            variant={variant}
            allowedModules={allowedModules}
          />

          {/* Backdrop mobile */}
          {mobileOpen && (
            <div
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
          )}

          <div className={collapsed ? 'md:ml-[60px] flex flex-col min-h-screen transition-all duration-300' : 'md:ml-[240px] flex flex-col min-h-screen transition-all duration-300'}>
            <Topbar
              userName={userName}
              userRole={userRole}
              userInitials={userInitials}
              userEmail={userEmail}
              onMenuClick={() => setMobileOpen(v => !v)}
            />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 md:pb-8 animate-fade-in">{children}</main>
          </div>
          <MobileBottomNav onMenuClick={() => setMobileOpen(v => !v)} variant={variant} allowedModules={allowedModules} />
          {/* FloatingAI (agente) deshabilitado — se reactivará cuando el agente entre en uso */}
        </div>
        </ToastProvider>
      </NavigationProgressProvider>
    </BootAnimation>
  );
}
