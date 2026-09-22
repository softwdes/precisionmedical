/**
 * Orden y filtro por tipo de caso de la lista de pacientes.
 *
 * Vive aparte de `patients-query.ts` —y sin un solo import de servidor— porque
 * lo necesitan los DOS lados: el `where`/`orderBy` de Prisma y el client
 * component que pinta los títulos de la tabla, que tiene que saber cuál está
 * activo para dibujar la flecha. Meterlo en `patients-query` arrastraría Prisma
 * al bundle del navegador; es el mismo motivo por el que el tamaño de página
 * vive en `patients-page.ts`.
 *
 * Lo que va acá son los VALORES y sus guardas. La traducción a `orderBy` de
 * Prisma se queda del lado del servidor (`ordenPacientes`, en `patients-query`).
 */

/** Los dos tipos de caso que la clínica separa. `GENERAL` se muestra como GM. */
export type TipoDeCaso = 'MVA' | 'GENERAL';

export function esTipoDeCaso(v: unknown): v is TipoDeCaso {
  return v === 'MVA' || v === 'GENERAL';
}

/**
 * Cómo se ordena la lista.
 *
 * `reciente` es el default y el que estaba antes de que esto existiera: la
 * clínica vive mirando a los que entraron hoy. Los dos por nombre son para
 * buscar a mano cuando no se acuerdan del código.
 *
 * Ordenar por nombre en SQL es seguro acá: el nombre NO está cifrado en la
 * base —el buscador lo prueba, hace `contains` directo sobre las columnas—, a
 * diferencia del teléfono, que necesita un segundo pase en memoria (ver
 * `idsPorTelefonoCifrado`). Si algún día se cifra, este orden pasaría a
 * ordenar el criptograma sin avisar.
 */
export type OrdenPacientes = 'reciente' | 'antiguo' | 'nombre' | 'nombreDesc';

export const ORDEN_POR_DEFECTO: OrdenPacientes = 'reciente';

export function esOrdenPacientes(v: unknown): v is OrdenPacientes {
  return v === 'reciente' || v === 'antiguo' || v === 'nombre' || v === 'nombreDesc';
}

/** Lo que llegó por la URL, o el default. Un valor inventado no viaja a Prisma. */
export function leerOrden(v: unknown): OrdenPacientes {
  return esOrdenPacientes(v) ? v : ORDEN_POR_DEFECTO;
}

/** Igual, para el tipo de caso. `undefined` = sin filtro (todos). */
export function leerTipoDeCaso(v: unknown): TipoDeCaso | undefined {
  return esTipoDeCaso(v) ? v : undefined;
}
