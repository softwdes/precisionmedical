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
  return (
    <thead>
      <tr className="border-b border-border bg-bg-2/50 text-text-muted text-[10px] uppercase tracking-wider">
        {children}
      </tr>
    </thead>
  );
}

function Th({
  children,
  align,
  width,
}: {
  children: React.ReactNode;
  align?: Align;
  width?: string;
}) {
  return (
    <th
      className={`${alignClass(align)} px-5 py-3 font-semibold`}
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
      className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors ${
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
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={`${alignClass(align)} px-5 py-3.5 ${className}`}
    >
      {children}
    </td>
  );
}

export const DataTable = { Card, Scroll, Table, Head, Th, Row, Td };
