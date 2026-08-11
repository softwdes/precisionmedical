/**
 * El caso abierto vive en la URL de la pantalla que lo contiene: `?case=<id>`.
 *
 * Antes la URL pasaba a ser la del caso (ruta interceptada) y un refresh
 * aterrizaba en la página completa, sin la lista ni la búsqueda. Con el id como
 * parámetro, recargar reproduce la vista tal cual: la lista con su `q` y su
 * `page` —que ya viajaban en la URL— más el caso abierto en su tab.
 *
 * Vive en un módulo neutro (sin `'use client'`) porque lo leen tanto las
 * páginas de server como los clientes que abren y cierran el modal.
 */

export const CASE_PARAM = 'case';
export const TAB_PARAM = 'tab';
/** Visita filtrada dentro del caso — `null`/ausente = todas. */
export const VISIT_PARAM = 'visit';

/** URL de ESTA pantalla con el caso abierto. No pisa el resto de los filtros. */
export function conCasoAbierto(
  pathname: string,
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  caseId: string,
  tab?: string,
  /**
   * Cita a la que se filtra el caso al abrirlo. La usa el calendario: si hiciste
   * clic en la cita del martes, el caso abre mostrando ESA consulta — es lo que
   * viniste a cobrar. Y como lo nuevo va a la visita filtrada, el cargo cae en
   * el martes y no en la última visita.
   */
  visitId?: string,
): string {
  const next = new URLSearchParams(params.toString());
  next.set(CASE_PARAM, caseId);
  if (tab) next.set(TAB_PARAM, tab);
  else next.delete(TAB_PARAM);
  if (visitId) next.set(VISIT_PARAM, visitId);
  else next.delete(VISIT_PARAM);
  return `${pathname}?${next.toString()}`;
}

/**
 * La misma URL sin el caso — es lo que usa "cerrar".
 *
 * Se va también el `tab`: es del caso, no de la lista, y dejarlo colgado hacía
 * que el siguiente caso que abrieras heredara el tab del anterior.
 */
export function sinCasoAbierto(
  pathname: string,
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): string {
  const next = new URLSearchParams(params.toString());
  next.delete(CASE_PARAM);
  next.delete(TAB_PARAM);
  // La visita filtrada es del caso: si queda colgada, el siguiente caso abre
  // filtrado por una cita que no es suya y aparece vacío.
  next.delete(VISIT_PARAM);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * La misma URL con la visita filtrada, o sin ella cuando `visitId` es null.
 *
 * Va en la URL igual que el caso y el tab: un refresh, o un link pasado por
 * chat, reproducen la vista filtrada tal cual.
 */
export function conVisitaFiltrada(
  pathname: string,
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  visitId: string | null,
): string {
  const next = new URLSearchParams(params.toString());
  if (visitId) next.set(VISIT_PARAM, visitId);
  else next.delete(VISIT_PARAM);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** La misma URL con otro tab del caso. */
export function conTab(
  pathname: string,
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  tab: string,
): string {
  const next = new URLSearchParams(params.toString());
  next.set(TAB_PARAM, tab);
  return `${pathname}?${next.toString()}`;
}

/**
 * Escribe la URL SIN pasar por el router de Next.
 *
 * `router.replace` es una navegación: cambia los searchParams y Next vuelve a
 * ejecutar el árbol de server de esa ruta. En estas pantallas eso significa
 * recargar la lista de pacientes Y volver a traer el caso entero con
 * `getCaseDetailData` — en CADA cambio de tab o de filtro. Un parpadeo y un
 * fetch por clic, para algo que el server solo necesita saber al entrar.
 *
 * Con `history.replaceState` la URL queda igual de compartible y de recargable
 * (al refrescar, el server la lee), pero cambiarla no dispara nada. El estado en
 * vivo lo tiene el cliente, que es de quien es.
 */
export function escribirUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', url);
}

/** Los searchParams actuales del navegador — para componer sobre lo que hay. */
export function paramsDelNavegador(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** Lo mínimo que necesitamos del `ReadonlyURLSearchParams` de Next. */
interface ReadonlyURLSearchParamsLike {
  toString(): string;
}
