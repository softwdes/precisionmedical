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

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AnchorRect {
  top: number; bottom: number; left: number; right: number;
}

export function AnchoredPanel({
  rect, anchorEl, width = 280, onClose, children,
}: {
  /** `getBoundingClientRect()` del botón que abrió el panel. */
  rect: AnchorRect;
  /**
   * El elemento que abrio el panel, para RECALCULAR la posicion al scrollear.
   *
   * Sin esto el panel se queda clavado donde se abrio —es `position: fixed` con
   * un rect capturado una sola vez— mientras la fila se va para arriba. Erick
   * el 2026-09-28: "mueve el scroll, se pierde, es desesperante usar ello".
   *
   * Es opcional para no obligar a los tres llamadores a la vez; el que no lo
   * pasa se comporta como antes.
   */
  anchorEl?: HTMLElement | null;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  /** Rect recalculado al scrollear. Null = todavia vale el que llego por prop. */
  const [vivo, setVivo] = useState<AnchorRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  // El ancla cambia (se abrio otro panel) => se descarta el rect viejo.
  useEffect(() => { setVivo(null); }, [anchorEl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    /*
     * Al scrollear el panel SIGUE al boton en vez de cerrarse.
     *
     * Antes se cerraba, y el motivo escrito era que "reposicionar en cada frame
     * es caro y un panel que flota siguiendo la fila se lee como un error". Lo
     * primero se resuelve con un `requestAnimationFrame`; lo segundo resulto ser
     * al reves en la practica. Erick lo uso el 2026-09-28 y dijo: "mueve el
     * scroll, se pierde, es desesperante usar ello". Estaba llenando un alta de
     * ajustador, scrolleaba para llegar al boton de guardar y perdia lo escrito.
     *
     * Si el ancla se va de la pantalla SI se cierra: un panel apuntando a una
     * fila que ya no esta es peor que ninguno.
     *
     * El listener va en CAPTURA para enterarse del scroll de la tabla, que no
     * burbujea hasta window — y en captura tambien llega el scroll de ADENTRO
     * del panel. Ese hay que ignorarlo: mover la lista de adentro no mueve el
     * ancla. Lo reporto Edson el 2026-09-18 cuando ademas cerraba.
     */
    let pendiente = 0;
    const recolocar = () => {
      pendiente = 0;
      if (!anchorEl) { onClose(); return; }   // sin ancla no hay a que seguir
      const b = anchorEl.getBoundingClientRect();
      // Fuera de la ventana (o la fila se desmonto): no hay a que apuntar.
      if (b.bottom < 0 || b.top > window.innerHeight || (b.width === 0 && b.height === 0)) {
        onClose();
        return;
      }
      setVivo({ top: b.top, bottom: b.bottom, left: b.left, right: b.right });
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      // Un solo recalculo por frame, no uno por evento de scroll.
      if (!pendiente) pendiente = requestAnimationFrame(recolocar);
    };
    // Resize va por su cuenta: su `target` es `window`, que no es un Node y no
    // se le puede preguntar a `contains`.
    const onResize = () => { if (!pendiente) pendiente = requestAnimationFrame(recolocar); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      if (pendiente) cancelAnimationFrame(pendiente);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose, anchorEl]);

  if (!mounted) return null;

  const MARGIN = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // El rect VIVO: el que se paso al abrir, o el del ancla recalculado al
  // scrollear. Ver `anchorEl` y el efecto de abajo.
  const r = vivo ?? rect;

  // Se alinea al borde izquierdo del boton, pero nunca sale de la pantalla: en
  // las columnas de la derecha el panel se pega al borde en vez de desbordar.
  const left = Math.min(Math.max(MARGIN, r.left), vw - width - MARGIN);

  // Debajo del boton salvo que no quepa; ahi va arriba. Sin esto, las ultimas
  // filas abrian un panel cortado por el borde inferior.
  /*
   * Se abre del lado donde ENTRA, no del lado donde alcanza a duras penas.
   *
   * El umbral era 240px, y con eso una fila a media pantalla abajo daba
   * ~300px: pasaba el corte, se abria hacia abajo, y el panel quedaba
   * espachurrado contra el borde con el ultimo boton en el filo. Medido en
   * produccion el 2026-09-28: el panel del ajustador con el alta abierta pide
   * unos 340px.
   *
   * Ahora se compara con ALTO_COMODO y, si de los dos lados falta, gana el que
   * tenga mas. El `maxHeight` sigue existiendo para el caso en que no entre de
   * ninguno de los dos.
   */
  const ALTO_COMODO = 340;
  const spaceBelow = vh - r.bottom;
  const spaceAbove = r.top;
  const openUp = spaceBelow < ALTO_COMODO && spaceAbove > spaceBelow;

  const style: React.CSSProperties = openUp
    ? { position: 'fixed', left, bottom: vh - r.top + 4, width, maxHeight: spaceAbove - MARGIN * 2 }
    : { position: 'fixed', left, top: r.bottom + 4, width, maxHeight: spaceBelow - MARGIN * 2 };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={panelRef}
        style={style}
        className="z-[61] overflow-y-auto scroll-thin rounded-lg bg-surface shadow-2xl p-3 space-y-2 text-left"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
