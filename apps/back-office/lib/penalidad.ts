/**
 * Con qué se busca la penalidad de un desenlace que consumió el horario.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Al sellar un no-show o una cancelación del mismo día se abre el catálogo de
 * cobros para asentar la penalidad. Se abría ENTERO: había que saber que el
 * código existe, escribir el término y elegir entre los resultados.
 *
 * Medido el 2026-09-23 sobre la base real: en cuatro días sueltos había **9
 * desenlaces cobrables y ninguno con su cargo**, el más viejo del 27 de agosto
 * — un mes sin cobrarse. La penalidad no se dejaba de asentar por olvido: se
 * dejaba porque cada vez había que buscarla.
 *
 * ── Por qué es texto y no un código ────────────────────────────────────────
 *
 * Lo tentador era clavar el id del ítem (`PM-2233`, `PM-11`) y agregarlo solo.
 * No se hace por dos motivos:
 *
 *  1. **Del lado del SEGURO el código no es uno solo.** Buscando "no show" hay
 *     dos ítems con nombres distintos —`1 · No show appointment` y
 *     `NO SHOW · PATIENT FAILS TO SHOW UP`— que huelen a ruido de la migración.
 *     Elegir uno sin que la clínica lo confirme es inventar una decisión de
 *     facturación. Queda pendiente que definan cuál vale.
 *
 *  2. **Un cargo es plata.** Dejar el resultado a la vista y que una persona
 *     confirme con un clic es distinto de cobrar solo. Acá se ahorra la
 *     búsqueda, no el consentimiento.
 *
 * ⚠️ El texto TIENE QUE COINCIDIR CON EL NOMBRE DEL ÍTEM EN LA BASE, que está
 * en inglés (`No Show`, `Cancel Same Day`). Por eso NO pasa por i18n:
 * traducirlo dejaría el buscador sin resultados justo en español.
 *
 * ── Lo que todavía falta ───────────────────────────────────────────────────
 *
 * Del lado del seguro NO existe ningún ítem para la cancelación del mismo día.
 * Acá igual se manda el término: si la clínica crea el código, esto lo encuentra
 * sin tocar nada; y mientras no exista, el buscador queda vacío y se ve — que es
 * mejor que abrir el catálogo entero y que la persona no sepa qué busca.
 */

/** Un desenlace, con lo mínimo para saber si cobra. */
export interface ConDesenlace {
  status: string;
  cancelledSameDay?: boolean | null;
}

/**
 * El término de búsqueda, o `undefined` cuando el desenlace no cobra nada.
 *
 * `undefined` y no `''` a propósito: el picker distingue "no me pidieron nada"
 * de "buscá la cadena vacía", y en el primer caso abre como siempre.
 */
export function busquedaDePenalidad(a: ConDesenlace): string | undefined {
  if (a.status === 'NO_SHOW') return 'No Show';
  if (a.status === 'CANCELLED' && a.cancelledSameDay === true) return 'Cancel Same Day';
  return undefined;
}
