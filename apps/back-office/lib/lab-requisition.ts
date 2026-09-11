/**
 * El número de requisición de laboratorio.
 *
 * Formato `#######-PM`, el mismo que emite MedUSA hoy (`1000005856-PM`), pero
 * de un RANGO distinto: nuestra secuencia arranca en 2000000000 y la de ellos
 * va por 1.000.005.8xx. Si compartieran rango, tarde o temprano habría dos
 * requisiciones con el mismo número —una de ellos y una nuestra— y con el tubo
 * ya etiquetado eso es una muestra atribuida a la orden equivocada.
 *
 * Ver `prisma/sql/20260910-lab-requisitions.sql`.
 */

import { db } from '@precision-medical/database';

/** Sufijo de la práctica, igual que en las hojas de MedUSA. */
export const SUFIJO = 'PM';

/**
 * Pide el siguiente número a la secuencia de Postgres.
 *
 * **El `::text` no es cosmético.** `nextval` devuelve `bigint`, y un bigint que
 * llega a JavaScript es un `BigInt` que `JSON.stringify` **no sabe serializar**:
 * revienta con "Do not know how to serialize a BigInt" en cuanto la respuesta
 * de la ruta intente salir. Lo descubrí verificando la secuencia después de
 * aplicarla — el error apareció en el script de verificación, no acá, y es
 * exactamente el que habría aparecido en producción al generar la primera hoja.
 *
 * La secuencia es la que garantiza que no haya dos iguales aunque dos personas
 * aprieten "Generar orden" en el mismo segundo: `nextval` es atómico y no se
 * revierte con la transacción, así que un número puede quedar sin usar —lo cual
 * está bien— pero nunca repetido, que es lo que no puede pasar.
 */
export async function siguienteNumeroRequisicion(): Promise<string> {
  const filas = await db.$queryRaw<Array<{ n: string }>>`
    SELECT nextval('lab_requisition_seq')::text AS n
  `;
  const n = filas[0]?.n;
  if (!n) throw new Error('La secuencia lab_requisition_seq no devolvió número');
  return `${n}-${SUFIJO}`;
}

/**
 * Lo que codifica el código de barras: cuenta de LabCorp y número de
 * requisición, separados por dos espacios — igual que la hoja real, donde el
 * texto bajo el código dice `43002290  1000005856-PM`.
 */
export function contenidoCodigoBarras(cuenta: string, numero: string): string {
  return `${cuenta}  ${numero}`;
}
