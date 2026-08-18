/**
 * DataTable — Wrappers tipados para tablas del back-office.
 *
 * Centraliza el styling de header (text-[10px] uppercase tracking-wider) y row hover.
 * No es genérico tipo TanStack — sigue usando JSX tradicional para flexibilidad.
 *
 * Uso:
 *   <DataTable.Card>
 *     <DataTable.Scroll>
 *       <DataTable.Table>
 *         <DataTable.Head>
 *           <DataTable.Th>Nombre</DataTable.Th>
 *           <DataTable.Th align="center">Tipo</DataTable.Th>
 *           <DataTable.Th align="right">Acciones</DataTable.Th>
 *         </DataTable.Head>
 *         <tbody>
 *           {items.map((x) => (
 *             <DataTable.Row key={x.id} onClick={() => goTo(x.id)} muted={!x.isActive}>
 *               <DataTable.Td>{x.name}</DataTable.Td>
 *               <DataTable.Td align="center">{x.type}</DataTable.Td>
 *               <DataTable.Td align="right">{actions}</DataTable.Td>
 *             </DataTable.Row>
 *           ))}
 *         </tbody>
 *       </DataTable.Table>
 *     </DataTable.Scroll>
 *     <TableFooter left={`${shown} de ${total}`} right="phoenix-dev · local" />
 *   </DataTable.Card>
 */

import * as React from 'react';

type Align = 'left' | 'center' | 'right';

const alignClass = (a: Align | undefined) => a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';

/**
 * Columnas fijas (Regla #4: obligatorias en tablas de 5+ columnas).
 *
 * El fondo de una celda sticky tiene que ser OPACO — si no, el contenido que
 * scrollea se ve por debajo. Y tiene que empatar con el fondo de su fila, o la
 * columna queda como una franja de otro color. Ese fondo es `bg-1` (el de
 * `DataTable.Card`), NO `bg-0`: `bg-0` es el fondo de la página y es más
 * oscuro que la Card.
 *
 * Esto se resolvía a mano en cada pantalla y salía mal seguido — el historial
 * de llamadas terminó abandonando `DataTable.Card` justo por esto. Vive acá
 * para que nadie más tenga que elegir el token.
 */
type Sticky = 'left' | 'right';

const stickySide = (s: Sticky): string => (s === 'left' ? 'sticky left-0' : 'sticky right-0');

/**
 * El hover de la fila (`hover:bg-white/[0.02]` en el `<tr>`) queda tapado por
 * el fondo opaco de la celda fija. Se repone con una capa `::before` sobre el
 * fondo, activada por el `group` de `DataTable.Row` — así el resaltado cruza
 * la fila entera y no solo el centro.
 */
const STICKY_BODY_BG = [
  'bg-bg-1',
  'before:absolute before:inset-0 before:pointer-events-none',
  'before:bg-white/[0.02] before:opacity-0 group-hover:before:opacity-100',
  'before:transition-opacity',
].join(' ');

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {children}
    </div>
  );
}

function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-sm">{children}</table>;
}

function Head({ children }: { children: React.ReactNode }) {
  // Opaco, no `bg-bg-2/50`: una celda sticky tiene que ser opaca sí o sí, y con
  // el header semitransparente quedaba de un tono distinto al resto de la fila.
  return (
    <thead>
      <tr className="border-b border-row-sep bg-bg-2 text-text-muted text-[10px] uppercase tracking-wider">
        {children}
      </tr>
    </thead>
  );
}

function Th({
  children,
  align,
  width,
  sticky,
  className = '',
}: {
  children: React.ReactNode;
  align?: Align;
  width?: string;
  /** Fija la columna al scrollear en horizontal. Ver nota de Sticky arriba. */
  sticky?: Sticky;
  className?: string;
}) {
  return (
    <th
      className={[
        alignClass(align),
        'px-4 py-2.5 font-semibold',
        sticky ? `${stickySide(sticky)} z-10 bg-bg-2` : '',
        className,
      ].filter(Boolean).join(' ')}
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

function Row({
  children,
  onClick,
  muted,
  highlight,
  highlightClass,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** Row de un registro inactivo (opacity 50). */
  muted?: boolean;
  /** Row destacado (ej. favorito) — pasa colorClass para el bg sutil. */
  highlight?: boolean;
  /** Override del highlight bg, ej: "bg-brand/[0.04]" */
  highlightClass?: string;
}) {
  return (
    <tr
      onClick={onClick}
      // `group` para que las celdas sticky puedan reponer el hover que su
      // fondo opaco tapa (ver STICKY_BODY_BG).
      className={`group border-b border-row-sep hover:bg-white/[0.02] transition-colors ${
        muted ? 'opacity-50' : ''
      } ${highlight ? (highlightClass ?? 'bg-brand/[0.04]') : ''} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </tr>
  );
}

function Td({
  children,
  align,
  className = '',
  onClick,
  colSpan,
  sticky,
  style,
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  colSpan?: number;
  /** Fija la columna al scrollear en horizontal. Ver nota de Sticky arriba. */
  sticky?: Sticky;
  /**
   * Escape hatch para el fondo de una celda STICKY.
   *
   * `STICKY_BODY_BG` es opaco a la fuerza y por eso pisa el `highlight` de
   * `DataTable.Row`: una fila resaltada se ve del color correcto en el medio y
   * del color normal en las columnas fijas. Hasta que el primitivo resuelva el
   * highlight como resuelve el hover (con una capa `::before`), esto deja
   * repintarlas desde afuera — el inline gana sobre la clase.
   */
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      style={style}
      className={[
        alignClass(align),
        'px-4 py-2',
        sticky ? `${stickySide(sticky)} z-10 ${STICKY_BODY_BG}` : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </td>
  );
}

export const DataTable = { Card, Scroll, Table, Head, Th, Row, Td };
