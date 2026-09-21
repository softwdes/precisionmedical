/**
 * Un color de identidad por provider, para distinguir de quién es cada cita
 * cuando dos o más atienden en la misma sede el mismo día.
 *
 * ── Por qué un punto y no el relleno de la tarjeta ───────────────────────────
 *
 * El relleno YA es un idioma y está lleno: ámbar = agendada, rose = MVA o
 * cancelada con aviso, pizarra = no vino, pizarra + aro ámbar = cancelada el
 * mismo día (hay penalidad), índigo = atendida, resplandor = primera visita. El
 * canto izquierdo tampoco está libre: cyan = telemedicina.
 *
 * Si el provider pintara el relleno, la tarjeta dejaría de poder decir qué pasó
 * con la cita — que es lo que mira recepción para saber a quién llamar y a quién
 * cobrarle. Ya hubo una confusión real por dos rellenos parecidos (2026-09-08).
 * Por eso el provider estrena su propio canal: un punto de 8px, que convive con
 * todo lo anterior y sobrevive con la pastilla "Motivo" prendida, que es
 * justamente cuando el nombre del provider desaparece de la tarjeta.
 *
 * ── Por qué hace falta ───────────────────────────────────────────────────────
 *
 * Medido sobre los últimos 90 días: el 40% de los días de clínica tienen dos o
 * más providers. Provo comparte día 45 de 84 veces y llega a CUATRO a la vez;
 * Spanish Fork, 13 de 15. Murray nunca (Erick, 21-sep-2026).
 *
 * ── Por qué no se guarda en la base (todavía) ────────────────────────────────
 *
 * Erick: *"asignalos por ahora vos; no pidieron un color por cada uno, cuando
 * pidan lo hacemos"*. El día que quieran elegirlo, esto se reemplaza por una
 * columna `color` en `providers` —como ya la tienen las clínicas— y su selector
 * en Configuración → Providers. Hasta entonces, asignarlo acá no cuesta
 * migración ni pantalla nueva.
 */

/**
 * Nueve colores, uno por provider activo, elegidos para distinguirse entre sí
 * en el tema oscuro.
 *
 * Son hex y no tokens de la casa a propósito: es color de IDENTIDAD, el mismo
 * tipo de dato que el `color` de cada clínica. Un token (`brand`, `rose`…) tiene
 * un significado asignado y acá el color no significa nada — solo separa
 * personas.
 *
 * Arranca en el celeste porque el primer pedido fue *"tal vez un color azulito
 * para Scott Rigdon"*, y la lista está ordenada para que los tres primeros
 * —celeste, violeta, verde— sean los más separados entre sí: son los que se van
 * a ver juntos en Provo, que es donde esto hace falta.
 */
const PALETA = [
  '#38BDF8', // celeste
  '#A78BFA', // violeta
  '#34D399', // verde
  '#FB923C', // naranja
  '#F472B6', // rosa
  '#2DD4BF', // turquesa
  '#E879F9', // fucsia
  '#A3E635', // lima
  '#818CF8', // índigo
] as const;

/**
 * Reparte la paleta entre los providers, de forma estable.
 *
 * El orden sale de ORDENAR LOS ID, no de cómo vengan en la lista: así el color
 * de cada uno no depende de quién esté activo ni de cómo los devuelva la API. Y
 * como los `cuid` arrancan con un prefijo de tiempo, un provider nuevo ordena al
 * final y se lleva un color libre **sin correr los de los demás** — que es lo
 * que haría inútil memorizar "Scott es celeste".
 *
 * Con más providers que colores la paleta da la vuelta y dos comparten. No se
 * previene acá: si algún día dos que comparten sede caen en el mismo color, esa
 * es exactamente la señal de que llegó el momento de dejarlos elegir el suyo.
 */
export function coloresDeProviders(providerIds: readonly string[]): Map<string, string> {
  const ordenados = [...new Set(providerIds)].sort();
  return new Map(ordenados.map((id, i) => [id, PALETA[i % PALETA.length]!]));
}
