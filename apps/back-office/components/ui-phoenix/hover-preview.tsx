'use client';

/**
 * HoverPreview — tarjeta flotante con el CONTENIDO de algo al pasar el mouse
 * por encima, sin tener que abrirlo.
 *
 * Nació para los snippets (Erick, 2026-09-07): con 32 en HPI, abrir uno por
 * uno con el ojo para saber cuál es no escala. La tarjeta muestra el HTML con
 * su formato —negritas, listas, las casillas como ☐ y los blancos subrayados—
 * pasado por el mismo saneador que la impresión (`safeHtml`), con los estilos
 * del editor (`.rte-content`).
 *
 * Cómo se abre:
 *  · mouse encima 250 ms (sin retardo parpadea mientras el cursor baja por la
 *    lista); se cierra al salir del disparador Y de la tarjeta, con un margen
 *    para cruzar de uno a otro
 *  · foco por teclado
 *  · en pantallas SIN hover (iPad, que es lo que usan los providers) un toque
 *    la abre y otro toque afuera la cierra — el "Ver" de al lado sigue siendo
 *    el camino al modal completo
 *
 * Se dibuja con `FloatingPanel` (portal, voltea si no entra, sigue al ancla),
 * así que funciona igual en una tabla, dentro de un diálogo o en la lista de
 * snippets del editor de la nota.
 */

import * as React from 'react';
import { FloatingPanel } from './floating-panel';
import { safeHtml } from '@/lib/safe-html';

export interface HoverPreviewProps {
  /** HTML a mostrar (se sanea acá; puede venir crudo del editor). */
  html: string | null | undefined;
  /** Cabecera chica de la tarjeta: de qué fila es, cuando la tarjeta es larga. */
  title?: string;
  /** El disparador. Se envuelve en un `span` inline-block que recibe los eventos. */
  children: React.ReactNode;
  width?: number;
  maxHeight?: number;
  /** Retardo de apertura con el mouse, en ms. */
  delay?: number;
  className?: string;
}

const CLOSE_GRACE_MS = 120;

export function HoverPreview({
  html, title, children, width = 520, maxHeight = 360, delay = 250, className = '',
}: HoverPreviewProps): React.ReactElement {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const abrir = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerrar = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Sin puntero con hover (táctil): el toque abre/cierra. */
  const sinHover = React.useRef(false);
  React.useEffect(() => {
    try { sinHover.current = window.matchMedia('(hover: none)').matches; } catch { /* sin matchMedia */ }
  }, []);

  const limpiar = (): void => {
    if (abrir.current) { clearTimeout(abrir.current); abrir.current = null; }
    if (cerrar.current) { clearTimeout(cerrar.current); cerrar.current = null; }
  };
  React.useEffect(() => limpiar, []);

  const programarApertura = (): void => {
    if (!html) return;
    limpiar();
    abrir.current = setTimeout(() => setOpen(true), delay);
  };
  const programarCierre = (): void => {
    limpiar();
    cerrar.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

  // Táctil: toque afuera cierra; Escape cierra siempre.
  React.useEffect(() => {
    if (!open) return;
    const afuera = (e: PointerEvent): void => {
      const t = e.target as Node | null;
      if (t && anchor.current?.contains(t)) return;
      if (t && (t as Element).closest?.('[data-hover-preview]')) return;
      setOpen(false);
    };
    const tecla = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', afuera, true);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', afuera, true);
      document.removeEventListener('keydown', tecla);
    };
  }, [open]);

  const contenido = React.useMemo(() => (html ? safeHtml(html) : ''), [html]);

  return (
    <>
      <span
        ref={anchor}
        className={`inline-block max-w-full ${className}`}
        onMouseEnter={() => { if (!sinHover.current) programarApertura(); }}
        onMouseLeave={() => { if (!sinHover.current) programarCierre(); }}
        onFocus={programarApertura}
        onBlur={programarCierre}
        onClick={() => { if (sinHover.current && html) { limpiar(); setOpen((v) => !v); } }}
      >
        {children}
      </span>
      <FloatingPanel anchorRef={anchor} open={open && !!contenido} width={width} maxHeight={maxHeight} className="!overflow-hidden flex flex-col">
        {/* El alto lo acota el FloatingPanel (al lugar que haya); acá solo se
            reparte: cabecera fija, cuerpo con scroll. */}
        <div
          data-hover-preview
          role="tooltip"
          className="flex flex-col min-h-0"
          onMouseEnter={limpiar}
          onMouseLeave={() => { if (!sinHover.current) programarCierre(); }}
        >
          {title && (
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted border-b border-border shrink-0 truncate">
              {title}
            </div>
          )}
          <div
            className="rte-content px-3 py-2.5 text-[12.5px] text-text-1 overflow-y-auto overscroll-contain min-h-0"
            dangerouslySetInnerHTML={{ __html: contenido }}
          />
        </div>
      </FloatingPanel>
    </>
  );
}
