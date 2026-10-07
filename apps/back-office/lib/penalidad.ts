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

// ─── Cuánto se cobra ──────────────────────────────────────────────────────────

/**
 * El monto con el que arranca la penalidad, según el tipo de caso.
 *
 * Regla de Erick (2026-10-07): una cita MVA que no vino —o que se canceló el
 * mismo día— son **$100**; una de medicina general (GM), **$50**. En los dos
 * casos el monto es EDITABLE: esto es lo que se propone, no lo que se impone.
 *
 * ── Por qué vive acá y no en el catálogo ───────────────────────────────────
 *
 * El tarifario NO sabe esto. El código de seguro "No show appointment" cuesta
 * $100 y no tiene segundo precio de medicina general (`feeGeneral` es null), y
 * del lado del efectivo "No Show" y "Cancel Same Day" cuestan $50 los dos. Medido
 * el 2026-10-07 sobre 120 días: el no-show MVA salió a $100 en 27 de 28 cargos
 * —alguien editaba el monto a mano—, y los 4 no-show GM que se cobraron salieron
 * a $50, $0, $166 y $0: no había una regla, había un lápiz.
 *
 * Cambiar el catálogo es una decisión de la clínica con su propio rastro de
 * verificación (`priceVerifiedAt/By`); esto es la regla de Admisión y se puede
 * mover al tarifario cuando la clínica lo decida, sin tocar la pantalla.
 *
 * Workers' comp y nursing home cotizan como MVA, igual que en el resto del
 * picker (`precioDeCargo`): solo medicina general tiene el precio chico.
 *
 * `null` = el caso no tiene tipo: no hay monto que proponer y se pide.
 */
export const PENALIDAD_MVA = 100;
export const PENALIDAD_GENERAL = 50;

export function precioDePenalidad(caseType: string | null | undefined): number | null {
  if (caseType === 'GENERAL') return PENALIDAD_GENERAL;
  if (caseType === 'MVA' || caseType === 'WORKERS_COMP' || caseType === 'NURSING_HOME') return PENALIDAD_MVA;
  return null;
}

/**
 * El ítem del catálogo de EFECTIVO que carga cada desenlace.
 *
 * Es el único circuito que tiene los DOS: del lado del seguro no existe ningún
 * código para la cancelación del mismo día. Y es el camino que ya usaba cobranza
 * para el no-show MVA. El monto lo manda la pantalla (ver `precioDePenalidad`),
 * así que el precio del catálogo ($50) solo es el de respaldo.
 *
 * Son los códigos reales de `catalog_items`; si la clínica los renombra, el
 * diálogo avisa que no los encontró y deja elegir otro.
 */
export function itemDePenalidad(a: ConDesenlace): { code: string; busqueda: string } | undefined {
  if (a.status === 'NO_SHOW') return { code: 'PM-2233', busqueda: 'No Show' };
  if (a.status === 'CANCELLED' && a.cancelledSameDay === true) return { code: 'PM-11', busqueda: 'Cancel Same Day' };
  return undefined;
}

/** ¿El monto escrito sirve? Mayor que cero, con a lo sumo dos decimales. */
export function montoValido(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return n > 0 ? n : null;
}
