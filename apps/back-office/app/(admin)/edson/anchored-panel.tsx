'use client';

/**
 * Panel flotante anclado a un botón, renderizado FUERA de la tabla.
 *
 * Existe por un motivo concreto: dentro de la grilla, un panel posicionado en
 * el flujo normal queda RECORTADO. `DataTable.Card` tiene `overflow-hidden` y
 * el contenedor de scroll tiene alto acotado — cualquier cosa absoluta ahí
 * dentro se corta por esas dos cajas, y el panel se ve "por debajo" de la tabla.
 *
 * Subir el `z-index` no arregla nada: no es un problema de capas sino de
 * recorte. La única salida es sacarlo del árbol con un portal y posicionarlo en
 * coordenadas de viewport contra el rectángulo del botón que lo abrió.
 *
 * Se usa en las columnas Attorney y Adjuster, donde Edson quiere un vistazo
 * rápido y un modal se siente pesado. Las observaciones sí son modal: ahí
 * escribe párrafos y necesita el ancho.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AnchorRect {
  top: number; bottom: number; left: number; right: number;
}

export function AnchoredPanel({
  rect, width = 280, onClose, children,
}: {
  /** `getBoundingClientRect()` del botón que abrió el panel. */
  rect: AnchorRect;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    /*
     * Al scrollear se cierra en vez de perseguir al botón. Reposicionar en cada
     * frame es caro y, sobre todo, un panel que flota siguiendo la fila se lee
     * como un error: si el usuario movió la tabla, ya no está mirando eso.
     */
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  if (!mounted) return null;

  const MARGIN = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Se alinea al borde izquierdo del boton, pero nunca sale de la pantalla: en
  // las columnas de la derecha el panel se pega al borde en vez de desbordar.
  const left = Math.min(Math.max(MARGIN, rect.left), vw - width - MARGIN);

  // Debajo del boton salvo que no quepa; ahi va arriba. Sin esto, las ultimas
  // filas abrian un panel cortado por el borde inferior.
  const spaceBelow = vh - rect.bottom;
  const openUp = spaceBelow < 240 && rect.top > spaceBelow;

  const style: React.CSSProperties = openUp
    ? { position: 'fixed', left, bottom: vh - rect.top + 4, width, maxHeight: rect.top - MARGIN * 2 }
    : { position: 'fixed', left, top: rect.bottom + 4, width, maxHeight: spaceBelow - MARGIN * 2 };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        style={style}
        className="z-[61] overflow-y-auto scroll-thin rounded-lg bg-surface shadow-2xl p-3 space-y-2 text-left"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
