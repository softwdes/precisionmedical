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
 *  · se posiciona pegado al ancla y con su MISMO ancho (o el propio, ver `width`)
 *  · se voltea hacia arriba si abajo no entra
 *  · sigue al ancla cuando el diálogo (o la página) scrollea (u `onScrollClose`)
 *
 * Sirve para las dos formas que tenía el problema:
 *  · panel de combobox — mismo ancho que el input, alineado a su izquierda
 *  · menú de acciones de una fila — ancho propio, alineado a la DERECHA de un
 *    botón chico
 *
 * El segundo caso se agregó porque el mismo bug estaba vivo en cuatro pantallas
 * que calculaban `top: r.bottom + 4` a mano y NINGUNA volteaba: en las últimas
 * filas de una tabla el menú se salía de la ventana y las opciones de abajo
 * quedaban inalcanzables (ni scrolleables, porque el menú tampoco acotaba su
 * alto). Los defaults son el comportamiento viejo, así que migrar es opt-in.
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
  /**
   * Ancho: `'anchor'` (default) copia el del ancla — un combobox mide lo que su
   * input. Un número es ancho propio, para un menú anclado a un botón chico.
   */
  width?: number | 'anchor';
  /**
   * Borde por el que se alinea. `'start'` (default) pega el izquierdo del panel
   * al izquierdo del ancla; `'end'` pega los derechos, que es lo que necesita un
   * menú de acciones al final de la fila para no salirse por la derecha.
   */
  align?: 'start' | 'end';
  /**
   * Si se pasa, el panel se CIERRA al scrollear en vez de seguir al ancla.
   *
   * Un menú de acciones se cierra (decisión de Erick): al scrollear la fila se
   * va de la vista y el menú deja de tener a qué referirse. Un combobox en
   * cambio sigue al ancla, porque el foco está en el campo y el usuario está
   * escribiendo. El scroll DE ADENTRO del panel no cuenta.
   */
  onScrollClose?: () => void;
}

export function FloatingPanel({
  anchorRef, open, children, maxHeight = 208, className = '',
  width = 'anchor', align = 'start', onScrollClose,
}: FloatingPanelProps): React.ReactElement | null {
  const [style, setStyle] = React.useState<React.CSSProperties>({ top: -9999, left: -9999, visibility: 'hidden' });
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

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
      const hostRect = enDialogo ? host.getBoundingClientRect() : null;
      const base = hostRect ?? { left: 0, top: 0, bottom: 0 };
      const w = width === 'anchor' ? r.width : width;
      const cabeAbajo = window.innerHeight - r.bottom >= maxHeight + 8;
      // Alineado por el borde que pidan, y sin salirse de la ventana por
      // ninguno de los dos lados: un menú a la derecha de la última columna
      // llega al borde, y en mobile el ancho propio puede ser mayor que el hueco.
      const crudo = align === 'end' ? r.right - w : r.left;
      const izq = Math.max(8, Math.min(crudo, window.innerWidth - w - 8));
      setStyle({
        position: enDialogo ? 'absolute' : 'fixed',
        left: izq - base.left,
        width: w,
        visibility: 'visible',
        /**
         * Volteado, el panel se ancla por su borde INFERIOR (`bottom`), no por el
         * superior calculado desde `maxHeight`.
         *
         * Con `top: r.top - maxHeight` el panel queda colgado a `maxHeight` del
         * ancla, y eso solo cae bien si el contenido llena ese alto EXACTO. El
         * menú de pacientes mide ~269px con `maxHeight={340}`: su borde de abajo
         * terminaba 71px por encima del botón — poco más de una fila — y se leía
         * como si el menú perteneciera a la fila de arriba. Lo reportó Erick.
         *
         * Con `bottom` el panel pega al ancla mida lo que mida, y `maxHeight`
         * vuelve a ser solo un techo, que es lo que siempre debió ser.
         */
        ...(cabeAbajo
          ? { top: r.bottom - base.top + 4 }
          : { bottom: (hostRect ? hostRect.bottom : window.innerHeight) - r.top + 4 }),
      });
    };
    compute();
    /**
     * `true` = fase de captura: se entera de CUALQUIER contenedor que scrollee,
     * sin tener que buscar cuál es.
     *
     * Con `onScrollClose` hay que descartar el scroll DE ADENTRO del panel: el
     * panel acota su alto y scrollea solo, así que sin este filtro mover la
     * rueda sobre un menú largo lo cerraría en la cara del usuario.
     */
    const alScrollear = (e: Event): void => {
      if (!onScrollClose) { compute(); return; }
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onScrollClose();
    };
    window.addEventListener('scroll', alScrollear, true);
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      window.removeEventListener('scroll', alScrollear, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, host, anchorRef, maxHeight, width, align, onScrollClose]);

  if (!open || !host) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ ...style, maxHeight }}
      className={`z-[9999] overflow-y-auto overscroll-contain rounded-md bg-bg-1 shadow-xl shadow-black/50 ${className}`}
    >
      {children}
    </div>,
    host,
  );
}
