'use client';

/**
 * SideDrawer — panel que entra desde el borde derecho.
 *
 * Calcado del `NotificationsDrawer` de `apps/web` (Regla #0: el patrón del
 * admin manda). Mismas medidas, mismo backdrop, misma curva de entrada, para
 * que abrir la campana se sienta igual en las dos apps — que es justo lo que
 * pidieron los usuarios.
 *
 * Por qué un panel y no un `Dialog` centrado: esto se OJEA. Un modal bloquea la
 * pantalla y encierra la lista en `max-h-60vh`; el panel deja el trabajo a la
 * vista, va a altura completa y respeta el modelo mental de "buzón". El diálogo
 * queda para lo que exige una decisión antes de seguir.
 *
 * Está acá y no inline en la campana porque es la clase de pieza que van a
 * querer otras pantallas — filtros avanzados, detalle lateral, historial.
 *
 * VA POR PORTAL A `body`, y no es opcional.
 *
 * El top bar es `sticky ... backdrop-blur-md`, y `backdrop-filter` convierte al
 * elemento en BLOQUE CONTENEDOR de cualquier `fixed` descendiente. Como la campana
 * vive dentro del `<header>`, sin portal este panel se encierra ahi: `h-full` pasa
 * a ser los 48px del header y `right-0` es el borde del header, no el de la
 * ventana. Se ve una franja con fondo y todo lo de abajo transparente — que es
 * exactamente el reporte que llego de los usuarios.
 *
 * En `apps/web` no hacia falta porque alla el drawer se monta DESPUES del
 * `</header>`, fuera de su alcance. Aca el boton y el panel viven juntos, asi que
 * la salida es el portal. Mismo problema y misma solucion que `FloatingPanel`
 * (memoria: css-fixed-inside-dialog-trap).
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@precision/ui';

export interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Título del encabezado. */
  title: string;
  /** Icono a la izquierda del título — el mismo que abre el panel. */
  icon?: React.ReactNode;
  /** Bloque opcional entre el título y la X (contadores, acciones). */
  headerRight?: React.ReactNode;
  /** Pie fijo, fuera del área que scrollea. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Etiqueta del botón de cerrar (i18n de quien lo usa). */
  closeLabel?: string;
}

export function SideDrawer({
  open,
  onClose,
  title,
  icon,
  headerRight,
  footer,
  children,
  closeLabel = 'Cerrar',
}: SideDrawerProps): React.ReactElement | null {
  // `document` no existe en el render del servidor: el portal se arma después
  // de montar. Un tick sin panel no se nota — nace cerrado.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  // Escape cierra. El backdrop también, pero con el teclado no se llega a él.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!montado) return null;

  return createPortal(
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/*
        Se monta SIEMPRE y se mueve con `translate-x`: así la entrada y la
        salida se animan. Montarlo condicionalmente lo hacía aparecer de golpe
        al cerrar, que es el detalle que delata un panel hecho a las apuradas.

        `aria-hidden` mientras está afuera para que el lector de pantalla no
        recorra una lista que no está en pantalla.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col',
          'bg-bg-1 border-l border-border shadow-xl',
          'transition-transform duration-300 ease-out-expo',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <h2 className="font-semibold text-text-1 truncate">{title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
              className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:bg-surface hover:text-text-1 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer !== undefined && (
          <div className="border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </>,
    document.body,
  );
}
