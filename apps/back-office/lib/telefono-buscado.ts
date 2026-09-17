/**
 * Buscar a un paciente por su teléfono, sin que importe cómo esté escrito.
 *
 * ── El problema, medido ───────────────────────────────────────────────────
 *
 * En `patients` conviven dos formatos de teléfono: `(385) 244-7519` y
 * `3852048651`. El `contains` de Prisma compara el texto tal cual está
 * guardado, así que encontrar a alguien dependía de que la puntuación que
 * tecleás coincida con la que tiene esa fila — y nadie puede saber eso.
 * Verificado en la app con un paciente real (17-sep-2026):
 *
 *   `3852447519`     → 0 resultados   (su número está con paréntesis)
 *   `(385) 244-7519` → lo encuentra
 *   `385-244-7519`   → 0 resultados   (el mismo número, otros guiones)
 *   `2447519`        → 0 resultados
 *
 * O sea: la búsqueda por teléfono funcionaba de casualidad. Y es de las tres
 * formas en que el mostrador busca a alguien (nombre, fecha de nacimiento,
 * teléfono), así que fallaba seguido y en silencio.
 *
 * ── La salida ─────────────────────────────────────────────────────────────
 *
 * Normalizar LOS DOS lados: sacarle los no-dígitos a la columna y comparar
 * contra los dígitos de lo que se tecleó. Va en SQL crudo porque
 * `regexp_replace` no se puede expresar en un `where` de Prisma.
 *
 * Vive acá y no en `patients-query.ts` porque los CUATRO buscadores de paciente
 * tienen el mismo agujero —la lista, el autocompletar de citas, el PreCall y la
 * búsqueda global— y ya nos pasó que el mismo filtro escrito en dos lugares se
 * desincronizara. Si el mismo texto no encuentra lo mismo en todas las
 * pantallas, el mostrador deja de confiar en el buscador.
 *
 * ⚠️ Esto es el parche, no la solución. Lo correcto es una columna
 * `phoneDigits` normalizada e indexada que se escriba en cada guardado; el día
 * que exista, esto se vuelve un `where` normal y el SQL crudo se borra. Está
 * anotado en `pending-tasks.md`.
 */

import { db } from '@precision-medical/database';

/**
 * Mínimo de dígitos para tratar el término como un teléfono.
 *
 * Cuatro, que es lo más corto que alguien dicta de verdad: *"el que termina en
 * 7519"*. Abajo de eso no baja: con tres, un `%385%` engancha a cientos de
 * pacientes del mismo prefijo, y esa lista de ids después viaja en un `IN`.
 */
export const MIN_DIGITOS_TELEFONO = 4;

/**
 * Techo de la lista de ids.
 *
 * Es una red, no un límite de negocio: con cuatro dígitos lo normal son unas
 * pocas filas. Si alguna búsqueda rarísima devolviera miles, lo que se corta es
 * el `IN`, no la pantalla.
 */
const TOPE_IDS = 500;

/** Los dígitos de un texto, y nada más. */
export const soloDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/**
 * Ids de pacientes cuyo teléfono —comparado POR DÍGITOS— contiene estos.
 *
 * Devuelve `[]` si el término no llega al piso, así que el llamador puede
 * invocarla siempre sin preguntar. Es un scan de ~5.700 filas sobre dos
 * columnas de texto: a este tamaño no se nota.
 */
export async function idsPorTelefono(termino: string): Promise<string[]> {
  const digitos = soloDigitos(termino);
  if (digitos.length < MIN_DIGITOS_TELEFONO) return [];

  const patron = `%${digitos}%`;
  /**
   * `[^0-9]` y no `\D`: en un template literal `\D` se cocina como una `D`
   * suelta, y el regexp pasaría a borrar las letras D en vez de los símbolos.
   * Compila igual y falla en silencio.
   */
  const filas = await db.$queryRaw<{ id: string }[]>`
    select id from patients
    where regexp_replace(coalesce(phone,  ''), '[^0-9]', '', 'g') like ${patron}
       or regexp_replace(coalesce(phone2, ''), '[^0-9]', '', 'g') like ${patron}
    limit ${TOPE_IDS}
  `;
  return filas.map(f => f.id);
}
