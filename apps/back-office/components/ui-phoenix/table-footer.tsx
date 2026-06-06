/**
 * TableFooter — Footer chiquito al pie de DataTable.Card.
 *
 * Suele mostrar "X de Y resultados" a la izquierda y branding/contexto a la derecha
 * (ej. "phoenix-dev · local", "fiscal year 2026", stats inline coloreadas).
 *
 * Uso:
 *   <TableFooter
 *     left={`${filtered.length} de ${total} aseguradoras`}
 *     right={<span className="font-mono">phoenix-dev · local</span>}
 *   />
 */

import * as React from 'react';

export interface TableFooterProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function TableFooter({ left, right }: TableFooterProps) {
  return (
    <div className="px-5 py-3 bg-bg-2/30 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}
