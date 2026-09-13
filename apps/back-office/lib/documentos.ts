/**
 * Documentos del paciente: el filtro de los NO borrados, en un solo lugar.
 *
 * Eliminar un documento marca la fila en vez de borrarla, así que toda consulta
 * que liste documentos tiene que excluir los marcados. Son once lugares —la
 * lista del caso, la del paciente, las tres de descarga, la mensajería, el
 * portal del abogado— y **olvidarse de uno no falla: muestra de más**. Un
 * documento que la clínica eliminó reapareciendo en el portal del abogado no
 * tira ningún error; simplemente está ahí.
 *
 * Por eso el filtro es una constante y no un `deletedAt: null` suelto: con un
 * grep de `VIGENTES` se ven todos los lugares que lo respetan, y los que no.
 *
 * No se usa middleware de Prisma a propósito: filtrar global haría invisible el
 * documento borrado también para la papelera y para restaurarlo, que son
 * exactamente las dos pantallas que necesitan verlo.
 */

/** Solo los que no se eliminaron. */
export const VIGENTES = { deletedAt: null } as const;

/** Solo los que están en la papelera. */
export const ELIMINADOS = { deletedAt: { not: null } } as const;
