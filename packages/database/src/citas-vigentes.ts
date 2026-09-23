/**
 * El filtro de citas no eliminadas.
 *
 * ── Por qué una constante y no un `deletedAt: null` suelto ───────────────────
 *
 * Eliminar una cita no borra la fila: la marca (ver el comentario de
 * `Appointment.deletedAt` en el schema). Eso deja ~45 consultas que LISTAN
 * citas repartidas en 36 archivos de CUATRO apps —el back-office, el portal del
 * abogado, forms y clinical— y todas tienen que excluir las eliminadas.
 *
 * **Olvidarse de una no falla: muestra de más.** No hay excepción ni error; la
 * cita borrada simplemente sigue ahí. Con la constante, un grep de `VIGENTES`
 * muestra los lugares que la respetan y los que no. Es la misma solución que
 * tomaron los documentos con su propio `VIGENTES`, por el mismo motivo y
 * después del mismo susto.
 *
 * ── Por qué vive acá y no en el back-office ──────────────────────────────────
 *
 * Porque cuatro apps leen la misma tabla. Si viviera en `apps/back-office/lib`,
 * `clinical` y `forms` tendrían que escribir el filtro a mano y el grep dejaría
 * de servir justo donde es más difícil acordarse.
 *
 * ── Por qué no un middleware global de Prisma ────────────────────────────────
 *
 * Filtrar en TODAS las consultas haría invisible la cita eliminada también para
 * la papelera y para restaurarla, que son exactamente las dos pantallas que
 * necesitan verla.
 *
 * ── Dónde NO va ──────────────────────────────────────────────────────────────
 *
 * En un `findUnique` por id: traer una cita eliminada por su id es legítimo —la
 * papelera y la restauración lo hacen—, y lo que no debe pasar es que aparezca
 * en una LISTA.
 *
 * Tampoco en `puedeEscribirLaCita` (`lib/appointment-scope.ts`): si ese chequeo
 * ignorara las eliminadas, restaurar una respondería 403.
 */

/** Solo las citas que no se eliminaron. */
export const VIGENTES = { deletedAt: null } as const;

/** Solo las que están en la papelera. */
export const ELIMINADAS = { deletedAt: { not: null } } as const;
