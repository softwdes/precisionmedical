'use client';

/**
 * TableFooter — Footer chiquito al pie de DataTable.Card.
 *
 * Suele mostrar "X de Y resultados" a la izquierda y branding/contexto a la derecha
 * (ej. "phoenix-dev · local", "fiscal year 2026", stats inline coloreadas).
 *
 * Con `pagination` suma el paginador (rango + anterior/siguiente) en el centro.
 * Se alimenta con `usePagination` — ver `use-pagination.ts`. Si hay una sola
 * página no se dibuja nada: un paginador de una página solo estorba.
 *
 * Uso:
 *   const pg = usePagination(filtered, { resetOn: [search, filter] });
 *   ...pg.pageItems.map(...)
 *   <TableFooter
 *     left={`${filtered.length} de ${total} aseguradoras`}
 *     pagination={pg}
 *     right={<span className="font-mono">phoenix-dev · local</span>}
 *   />
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TableFooterPagination {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  setPage: (page: number) => void;
}

export interface TableFooterProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  pagination?: TableFooterPagination;
}

export function TableFooter({ left, right, pagination }: TableFooterProps) {
  const tc = useTranslations('phoenix.common');
  const pg = pagination && pagination.pageCount > 1 ? pagination : null;

  return (
    <div className="px-5 py-3 bg-bg-2/30 border-t border-row-sep text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
      <span>{left}</span>
      {pg && (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{tc('pageRange', { from: pg.from, to: pg.to, total: pg.total })}</span>
          <div className="flex items-center gap-1">
            <button
              type="button" aria-label={tc('pagePrev')} title={tc('pagePrev')}
              onClick={() => pg.setPage(pg.page - 1)} disabled={pg.page <= 1}
              className="p-1 rounded hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button" aria-label={tc('pageNext')} title={tc('pageNext')}
              onClick={() => pg.setPage(pg.page + 1)} disabled={pg.page >= pg.pageCount}
              className="p-1 rounded hover:bg-bg-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {right && <span>{right}</span>}
    </div>
  );
}
