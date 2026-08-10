'use client';

/**
 * FloatingPanel — panel anclado a un elemento que se dibuja FUERA del árbol
 * donde vive (portal a `body`, `position: fixed`).
 *
 * Existe porque el mismo bug apareció tres veces: un desplegable `absolute`
 * dentro de un diálogo queda RECORTADO por el `overflow-y-auto` del cuerpo, y
 * el `transform` del DialogContent además se vuelve bloque contenedor de
 * cualquier `fixed` hijo (ver memoria: css-fixed-inside-dialog-trap). El
 * portal es la única salida real.
 *
 * Qué resuelve:
 *  · se posiciona pegado al ancla y con su MISMO ancho
 *  · se voltea hacia arriba si abajo no entra
 *  · sigue al ancla cuando el diálogo (o la página) scrollea
 *
 * Uso:
 *   const anchor = useRef<HTMLDivElement>(null);
 *   <div ref={anchor}><input … /></div>
 *   <FloatingPanel anchorRef={anchor} open={open}>…filas…</FloatingPanel>
 */

import * as React from 'react';
import { createPortal } from 'react-dom';

export interface FloatingPanelProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: React.ReactNode;
  /** Alto máximo del panel en px (default 208 = max-h-52) */
  maxHeight?: number;
  /** Clases extra del panel */
  className?: string;
}

export function FloatingPanel({
  anchorRef, open, children, maxHeight = 208, className = '',
}: FloatingPanelProps): React.ReactElement | null {
  const [style, setStyle] = React.useState<React.CSSProperties>({ top: -9999, left: -9999, visibility: 'hidden' });
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  /**
   * Dónde se monta: si el ancla vive dentro de un diálogo, **dentro del
   * diálogo**; si no, en `body`.
   *
   * Por qué no siempre `body`: Radix bloquea la rueda del mouse fuera del
   * diálogo (react-remove-scroll), así que un panel portaleado a `body` se
   * veía completo pero NO SCROLLEABA. Montándolo en el propio DialogContent
   * queda dentro del subárbol permitido y scrollea normal. Y como el diálogo
   * no recorta (no tiene `overflow-hidden`) el panel puede sobresalir de sus
   * bordes igual, que es lo que se buscaba al sacarlo del cuerpo scrolleable.
   */
  React.useLayoutEffect(() => {
    if (!open) { setHost(null); return; }
    const dialog = anchorRef.current?.closest('[role="dialog"]') as HTMLElement | null;
    setHost(dialog ?? document.body);
  }, [open, anchorRef]);

  React.useLayoutEffect(() => {
    if (!open || !host) return;
    const enDialogo = host !== document.body;
    const compute = (): void => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Dentro del diálogo las coordenadas son RELATIVAS a su caja: el
      // DialogContent está `fixed` + `translate`, así que es el bloque
      // contenedor de sus hijos absolutos.
      const base = enDialogo ? host.getBoundingClientRect() : { left: 0, top: 0 };
      const cabeAbajo = window.innerHeight - r.bottom >= maxHeight + 8;
      setStyle({
        position: enDialogo ? 'absolute' : 'fixed',
        left: r.left - base.left,
        width: r.width,
        visibility: 'visible',
        top: cabeAbajo
          ? r.bottom - base.top + 4
          : r.top - base.top - maxHeight - 4,
      });
    };
    compute();
    // `true` = fase de captura: se entera de CUALQUIER contenedor que
    // scrollee, sin tener que buscar cuál es.
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, host, anchorRef, maxHeight]);

  if (!open || !host) return null;

  return createPortal(
    <div
      style={{ ...style, maxHeight }}
      className={`z-[9999] overflow-y-auto overscroll-contain rounded-md bg-bg-1 shadow-xl shadow-black/50 ${className}`}
    >
      {children}
    </div>,
    host,
  );
}
