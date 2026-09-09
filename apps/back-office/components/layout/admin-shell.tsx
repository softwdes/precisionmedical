'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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
  /** 'doctor' activa el portal médico (violet, rutas /doctor/*); 'attorney' el
   *  portal legal (rutas /attorney/*). */
  variant?:      'admin' | 'doctor' | 'attorney';
  /** Checks por menú del rol (roles_config.pm_clinic_modules). null = ve todo. */
  allowedModules?: Record<string, boolean> | null;
  /** Capacidad "ver como doctor": agrega el Portal Médico al menú. Va aparte de
   *  `allowedModules` porque ahí null significa "ve todo" y esta es opt-in. */
  canViewAsDoctor?: boolean;
  /** Capacidad "supervisión de notas": agrega Notas clínicas al menú. Opt-in. */
  canAuditNotes?: boolean;
  /** Capacidad "pedidos de bufetes": agrega ese menú al final del back-office. Opt-in. */
  canSeeFirmRequests?: boolean;
  /** Bloque libre al pie del menú lateral (Portal Legal: tarjeta de oficina). */
  sidebarBelowNav?: React.ReactNode;
  /** Contadores por menú (Portal Legal: referidos pendientes). */
  sidebarBadges?: Record<string, number> | null;
}

export function AdminShell({
  children,
  userName     = 'Usuario',
  userRole     = '',
  userInitials = 'U',
  userEmail    = '',
  variant      = 'admin',
  allowedModules = null,
  canViewAsDoctor = false,
  canAuditNotes = false,
  canSeeFirmRequests = false,
  sidebarBelowNav = null,
  sidebarBadges = null,
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
            canViewAsDoctor={canViewAsDoctor}
            canAuditNotes={canAuditNotes}
            canSeeFirmRequests={canSeeFirmRequests}
            belowNav={sidebarBelowNav}
            badges={sidebarBadges}
          />

          {/* Backdrop mobile */}
          {mobileOpen && (
            <div
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
          )}

          {/* `--pm-shell-left` publica cuánto ocupa el sidebar para que una barra
              `fixed` de una pantalla pueda esquivarlo. Un `fixed` no hereda el
              `ml` de este wrapper, así que sin esto arranca en x=0 y el menú le
              tapa los primeros 240px (medido en la barra de acciones de
              Seguimiento). Va como variable y no como número en duro porque el
              sidebar se colapsa a 60px. */}
          <div
            style={{ '--pm-shell-left': collapsed ? '60px' : '240px' } as CSSProperties}
            className={collapsed ? 'md:ml-[60px] flex flex-col min-h-screen transition-all duration-300' : 'md:ml-[240px] flex flex-col min-h-screen transition-all duration-300'}
          >
            <Topbar
              userName={userName}
              userRole={userRole}
              userInitials={userInitials}
              userEmail={userEmail}
              onMenuClick={() => setMobileOpen(v => !v)}
              sidebarCollapsed={collapsed}
              onToggleSidebar={() => handleCollapsedChange(!collapsed)}
              portal={variant === 'attorney' ? 'attorney' : 'clinic'}
            />
            {/* Aire al pie en móvil: la barra inferior mide 64px (pb-20), y en el
                portal legal encima de ella flota el botón de referir (56px +
                margen), así que ahí hace falta más — sin esto tapaba el botón
                Responder de Mensajes y el paginador de Casos al llegar al fondo.
                Auditoría móvil 2026-09-08. */}
            <main className={`flex-1 p-4 sm:p-6 lg:p-8 md:pb-8 animate-fade-in ${variant === 'attorney' ? 'pb-40' : 'pb-20'}`}>{children}</main>
          </div>
          <MobileBottomNav onMenuClick={() => setMobileOpen(v => !v)} variant={variant} allowedModules={allowedModules} />
          {/* FloatingAI (agente) deshabilitado — se reactivará cuando el agente entre en uso */}
        </div>
        </ToastProvider>
      </NavigationProgressProvider>
    </BootAnimation>
  );
}
