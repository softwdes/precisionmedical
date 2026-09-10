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
  /**
   * Ref al div del panel, para quien necesite preguntar si un clic cayó
   * ADENTRO — el caso típico es el "cerrar al clickear afuera" de un combobox,
   * que sin esto se dispara también al arrastrar la barra de scroll del panel.
   * Si no se pasa, el componente usa uno propio.
   */
  panelRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * `false` cuando el panel NO scrollea como un todo porque tiene una parte
   * fija — el caso es un combobox con buscador arriba: si scrollea el panel
   * entero, el campo de búsqueda se va de la vista al bajar por la lista.
   *
   * Con `false` el panel queda `flex flex-col overflow-hidden` y el `maxHeight`
   * calculado sigue mandando; adentro, la parte que scrollea se marca con
   * `flex-1 min-h-0 overflow-y-auto` y es la única que se mueve.
   */
  scroll?: boolean;
  /**
   * Piso de ancho en px. `width: 'anchor'` copia al ancla y nada más, pero un
   * trigger angosto puede dar un panel donde no entra el contenido (nombre +
   * rol, código de caso + fecha). El techo sigue siendo la ventana.
   */
  minWidth?: number;
}

export function FloatingPanel({
  anchorRef, open, children, maxHeight = 208, className = '',
  width = 'anchor', align = 'start', onScrollClose, panelRef: panelRefExterno, scroll = true, minWidth = 0,
}: FloatingPanelProps): React.ReactElement | null {
  const [style, setStyle] = React.useState<React.CSSProperties>({ top: -9999, left: -9999, visibility: 'hidden' });
  /** `maxHeight` acotado al lugar que hay de verdad en el lado elegido. */
  const [alto, setAlto] = React.useState(maxHeight);
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const panelRefPropio = React.useRef<HTMLDivElement>(null);
  const panelRef = panelRefExterno ?? panelRefPropio;

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
      const w = Math.max(width === 'anchor' ? r.width : width, minWidth);
      /**
       * Abajo si entra entero; si no, arriba si entra entero; y si no entra en
       * ninguno de los dos lados, el que tenga más lugar, con el alto ACOTADO a
       * ese lugar. Sin este último caso una tarjeta de 360px anclada a una fila
       * a 300px del borde se volteaba hacia arriba y se salía de la ventana —
       * el título y las primeras líneas quedaban cortados sin forma de verlos.
       */
      const espacioAbajo = window.innerHeight - r.bottom - 8;
      const espacioArriba = r.top - 8;
      const cabeAbajo = espacioAbajo >= maxHeight || (espacioArriba < maxHeight && espacioAbajo >= espacioArriba);
      const altoEfectivo = Math.min(maxHeight, Math.max(96, cabeAbajo ? espacioAbajo : espacioArriba));
      setAlto(altoEfectivo);
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
      style={{ ...style, maxHeight: alto }}
      className={`z-[9999] ${scroll ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden'} rounded-md bg-bg-1 shadow-xl shadow-black/50 ${className}`}
    >
      {children}
    </div>,
    host,
  );
}
