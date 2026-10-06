'use client';

import * as React from 'react';
import type { TableFooterPagination } from './table-footer';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Pagina en el cliente una lista YA filtrada.
 *
 * El filtrado y la búsqueda van primero sobre todas las filas y la paginación
 * después: así el contador de la tabla sigue siendo el total filtrado. `resetOn`
 * lleva lo que cambia el resultado (búsqueda, filtros, pestaña): al cambiar,
 * se vuelve a la página 1. La página se acota sola si la lista se encoge (por
 * ejemplo al borrar la última fila de la última página).
 */
export function usePagination<T>(
  items: T[],
  opts: { pageSize?: number; resetOn?: ReadonlyArray<unknown> } = {},
): TableFooterPagination & { pageItems: T[] } {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const [page, setPage] = React.useState(1);

  const resetKey = JSON.stringify(opts.resetOn ?? []);
  React.useEffect(() => { setPage(1); }, [resetKey]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    total,
    setPage: (p) => setPage(Math.min(Math.max(1, p), pageCount)),
    pageItems: items.slice(start, start + pageSize),
  };
}
