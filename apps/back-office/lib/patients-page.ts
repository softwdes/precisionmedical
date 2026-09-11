/**
 * Tamaño de página de la lista de pacientes, en UN solo lugar.
 *
 * El número vivía escrito cuatro veces —las dos páginas (`/patients` y
 * `/doctor/patients`), la API y el cliente— y ya se habían desincronizado dos
 * veces con síntomas distintos:
 *
 *   · la API tenía 15 y la página 10: el servidor pintaba 10 filas y, apenas
 *     montaba el cliente, las reemplazaba por 15. La grilla "crecía sola".
 *   · el cliente construía los enlaces de paginación con `if (size !== 15)`,
 *     así que elegir 15 filas y pasar de página **volvía a 10**: el único valor
 *     que no viajaba en la URL era justo el que había que recordar.
 *
 * Vive en `lib/` y sin imports de servidor a propósito: lo comparte un client
 * component, y ponerlo en `patients-data.tsx` arrastraría Prisma al bundle.
 */

/** Filas por página cuando la URL no dice otra cosa. */
export const PATIENTS_PAGE_SIZE = 10;

/** Opciones del selector "filas por página". */
export const PATIENTS_PAGE_SIZES = [10, 15, 25, 50] as const;

/**
 * El `size` de la URL, acotado. Fuera de rango o basura → el default.
 * El clamp es el mismo para la página y para la API: una URL a mano no puede
 * pedir el padrón entero en una sola consulta.
 */
export function tamanoDePagina(param?: string | null): number {
  const n = parseInt(param ?? '', 10);
  if (!Number.isFinite(n)) return PATIENTS_PAGE_SIZE;
  return Math.min(50, Math.max(5, n));
}
