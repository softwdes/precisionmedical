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
 * Hover de fila — una capa ENCIMA, no un cambio de fondo.
 *
 * Antes el `<tr>` hacía `hover:bg-white/[0.02]`, o sea REEMPLAZABA su fondo. En
 * una fila que ya tiene color propio (un no-show gris, un "listo para Brunella"
 * verde) eso borraba el color al pasar el mouse — y las celdas fijas, que
 * pintan su fondo aparte, lo conservaban. El resultado era una fila que al
 * hacer hover se marcaba solo por los extremos.
 *
 * Ahora TODAS las celdas llevan la misma capa `::before`, activada por el
 * `group` del `<tr>`. Se compone sobre cualquier fondo, sea el de la Card o uno
 * calculado en runtime, y el resaltado cruza la fila entera.
 */
const HOVER_OVERLAY = [
  'relative',
  'before:absolute before:inset-0 before:pointer-events-none',
  'before:bg-white/[0.02] before:opacity-0 group-hover:before:opacity-100',
  'before:transition-opacity',
].join(' ');

/**
 * Fondo de la celda fija. Tiene que ser OPACO (ver nota de Sticky arriba); el
 * hover lo repone `HOVER_OVERLAY`, que llevan todas las celdas.
 */
const STICKY_BODY_BG = 'bg-bg-1';

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {children}
    </div>
  );
}

/**
 * Contenedor de scroll de la tabla.
 *
 * `maxHeight` convierte la caja en un scroll VERTICAL propio, y con eso el
 * encabezado se congela al bajar. Sin el, no hay forma: `overflow-x-auto` ya
 * hace que `overflow-y` compute a `auto` (asi lo define la spec), o sea que la
 * caja YA es un contenedor de scroll — pero de alto automatico, asi que nunca
 * scrollea en vertical y un `top: 0` no tiene contra que pegarse. El sticky del
 * `<thead>` quedaba inerte aunque estuviera bien escrito.
 *
 * Es opcional para no cambiarle el comportamiento a las ~20 pantallas que ya
 * usan el primitivo: solo lo pide quien de verdad lo necesita.
 */
function Scroll({ children, maxHeight, headHeight = '34px' }: {
  children: React.ReactNode;
  maxHeight?: string;
  /**
   * Alto REAL de la fila de encabezados. Solo hace falta pasarlo si la vista
   * le pisa el padding o el tamaño de letra al `Th`.
   *
   * El default sale del primitivo sin tocar: `py-2.5` (10px arriba y abajo)
   * mas una linea de 10px = ~34px.
   *
   * Se declara en vez de medirse porque medir pide un hook, y este primitivo
   * lo importan server components (el portal del abogado, el `loading.tsx`
   * del admin): volverlo cliente por un detalle visual saldria mucho mas caro
   * que esta prop.
   */
  headHeight?: string;
}) {
  return (
    <div
      className={maxHeight ? 'overflow-x-auto overflow-y-auto' : 'overflow-x-auto'}
      /*
       * `--dt-head-h` lo consume `GroupRow` para pegarse JUSTO debajo del
       * encabezado.
       *
       * Si el valor queda MAS GRANDE que el encabezado real, la banda de grupo
       * flota mas abajo de donde deberia y tapa la primera fila del grupo — se
       * ve como una fila cortada por la mitad. Fue exactamente el bug de la
       * vista de tracking, que bajo el `Th` a `py-1` + 7px (~17px reales)
       * mientras esto seguia clavado en 34.
       */
      style={{ ...(maxHeight ? { maxHeight } : {}), ['--dt-head-h' as string]: headHeight }}
    >
      {children}
    </div>
  );
}

/**
 * Fila separadora de grupo (ej. "miércoles 19 de agosto — 3 citas").
 *
 * Se fija en los DOS ejes, y cada uno resuelve un problema distinto:
 *
 *  · Arriba, debajo del encabezado: al bajar por un día largo se pierde de
 *    vista a qué día pertenece la fila que se está mirando.
 *  · A la IZQUIERDA: sin esto, al scrollear en horizontal el texto se va de
 *    pantalla y el separador queda como una banda vacía. El `<td>` ocupa todo
 *    el ancho de la tabla, así que su contenido se desplaza con ella.
 *
 * El z queda ENTRE el encabezado (20/30) y las celdas del cuerpo (10): pasa por
 * encima de las filas al scrollear, pero se mete debajo del encabezado.
 */
function GroupRow({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="sticky top-[var(--dt-head-h)] z-[15] bg-bg-1 px-4 py-1.5"
      >
        <div className="sticky left-4 w-fit">{children}</div>
      </td>
    </tr>
  );
}

/**
 * `gridLines` dibuja una linea vertical entre columnas.
 *
 * Es una EXCEPCION consciente a la regla de bordes del CLAUDE.md ("el fondo
 * separa, la linea sobra"). Se aprobo para la vista de tracking porque Edson
 * viene de una hoja de calculo, donde la cuadricula ES la estructura: con 13
 * columnas y sin lineas, se le iba el ojo de fila.
 *
 * Se activa por pantalla y no por defecto, para que las demas tablas del
 * back-office sigan como estan.
 */
function Table({ children, gridLines, className = '' }: {
  children: React.ReactNode;
  gridLines?: boolean;
  /** Ajustes de la pantalla, ej. un tamaño de fuente propio. */
  className?: string;
}) {
  return (
    <table
      className={[
        'w-full text-sm',
        // `[&_td]` en vez de tocar cada celda: la linea va a la DERECHA de cada
        // una y la ultima de la fila no la lleva.
        // `border-strong` y no `row-sep`: este ultimo es 7% de opacidad en tema
        // claro y la linea casi no se veia. Edson pidio que se noten — viene de
        // una hoja de calculo, donde la cuadricula se lee de lejos.
        gridLines ? '[&_td]:border-r [&_td]:border-border-strong [&_td:last-child]:border-r-0'
                  + ' [&_th]:border-r [&_th]:border-border-strong [&_th:last-child]:border-r-0'
                  // Las horizontales al mismo tono que las verticales: una
                  // cuadricula con un eje fuerte y el otro casi invisible se lee
                  // peor que sin lineas. `!` porque `DataTable.Row` ya trae su
                  // `border-row-sep` y hay que ganarle.
                  + ' [&_tbody_tr]:!border-b-border-strong' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </table>
  );
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
        // `top-0` congela la fila de encabezados cuando el contenedor tiene
        // `maxHeight`; sin el, no hace nada. El z es MAYOR que el de las celdas
        // del cuerpo (z-10) para que el encabezado pase por encima al bajar, y
        // las esquinas (fija arriba Y al costado) necesitan uno mas todavia.
        // El `border-b` vive en el <tr>, y un borde de fila no viaja con las
        // celdas al quedar fijas: al bajar, el encabezado flotaba sin linea
        // que lo separara. La sombra de 1px la repone en la celda misma.
        'sticky top-0 bg-bg-2 shadow-[0_1px_0_0_var(--row-sep)]',
        sticky ? `${stickySide(sticky)} z-30` : 'z-20',
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
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** Row de un registro inactivo (opacity 50). */
  muted?: boolean;
  /** Row destacado (ej. favorito) — pasa colorClass para el bg sutil. */
  highlight?: boolean;
  /** Override del highlight bg, ej: "bg-brand/[0.04]" */
  highlightClass?: string;
  /**
   * Fondo calculado en runtime, cuando el color no se puede expresar como
   * clase de Tailwind (ej. un `color-mix` que depende del estado del registro).
   * Las celdas STICKY llevan fondo opaco propio y hay que repintarlas aparte
   * con el `style` de `DataTable.Td`.
   */
  style?: React.CSSProperties;
}) {
  return (
    <tr
      onClick={onClick}
      style={style}
      // `group` para que las celdas sticky puedan reponer el hover que su
      // fondo opaco tapa (ver STICKY_BODY_BG).
      // El hover ya no vive acá: lo pone cada celda con `HOVER_OVERLAY`, para
      // que se componga sobre el fondo en vez de reemplazarlo.
      className={`group border-b border-row-sep transition-colors ${
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
        HOVER_OVERLAY,
        sticky ? `${stickySide(sticky)} z-10 ${STICKY_BODY_BG}` : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </td>
  );
}

export const DataTable = { Card, Scroll, Table, Head, Th, Row, Td, GroupRow };
