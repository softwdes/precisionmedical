/**
 * El teléfono de un paciente, cuando el paciente tiene DOS campos.
 *
 * `patients` guarda `phone` (principal) y `phone2` (celular). Casi toda la app
 * leía solo `phone`, y eso dejaba a mucha gente como si no tuviera teléfono:
 *
 *   · **3.077 de 5.737 pacientes tienen SOLO celular** — es el grupo más
 *     grande de los cuatro. Con caso abierto son 1.048.
 *   · No aparecían en la columna de Tracking, no se los encontraba buscando por
 *     su número, no se les podía hacer clic para llamar…
 *   · …y el formulario de admisión **se negaba a salir por SMS** con un
 *     "Paciente no tiene teléfono registrado" mientras el celular estaba
 *     cargado en la ficha: **1.120 casos abiertos** en esa situación.
 *
 * Todo medido el 2026-09-15, a partir de tres pacientes que Erick vio sin
 * teléfono en Tracking (Mapu, Mapu-White y Nolasco). El que sí se veía en esa
 * pantalla —Cruz— no estaba mejor cargado: tenía el MISMO número repetido en
 * los dos campos, y le tocó el que la pantalla miraba.
 *
 * ── Por qué gana `phone` ───────────────────────────────────────────────────
 * De los 1.213 pacientes que tienen los dos campos llenos, **977 tienen el
 * mismo número**. Solo 236 son distintos de verdad. O sea que `phone2` casi
 * nunca es "otro teléfono": es dónde cayó el número al cargarlo. Por eso elegir
 * uno es seguro, y el principal es el que corresponde cuando hay dos.
 *
 * ⚠️ Para BUSCAR no sirve elegir uno: hay que mirar los dos, o la persona que
 * escribe el celular de un paciente que también tiene fijo no lo encuentra.
 * Para eso está `telefonosDe`.
 */

/** Lo mínimo que hace falta saber de un paciente para sacarle el teléfono. */
export interface ConTelefonos {
  phone?: string | null;
  phone2?: string | null;
}

function limpio(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/**
 * El teléfono para MOSTRAR y para LLAMAR: el principal, y si no hay, el celular.
 *
 * `null` solo cuando de verdad no hay ninguno — y eso sí significa que no se lo
 * puede contactar.
 */
export function telefonoDe(p: ConTelefonos | null | undefined): string | null {
  if (!p) return null;
  return limpio(p.phone) ?? limpio(p.phone2);
}

/**
 * Los dos, para BUSCAR. Sin repetir el mismo número escrito distinto.
 *
 * La comparación es por dígitos: `(801) 833-7601` y `8018337601` son el mismo
 * teléfono, y quien busca escribe cualquiera de las dos formas.
 */
export function telefonosDe(p: ConTelefonos | null | undefined): string[] {
  if (!p) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const v of [limpio(p.phone), limpio(p.phone2)]) {
    if (!v) continue;
    const digitos = soloDigitos(v);
    if (digitos === '' || vistos.has(digitos)) continue;
    vistos.add(digitos);
    salida.push(v);
  }
  return salida;
}

/** Los dígitos de un teléfono, que es lo único comparable entre formatos. */
export function soloDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * ¿Alguno de los teléfonos del paciente contiene lo que se escribió?
 *
 * Compara por dígitos contra los DOS campos. Devuelve `false` con menos de 3
 * dígitos: con uno o dos, el filtro deja pasar a casi todo el mundo y el
 * buscador parece roto.
 */
export function coincideTelefono(p: ConTelefonos | null | undefined, consulta: string): boolean {
  const buscado = soloDigitos(consulta);
  if (buscado.length < 3) return false;
  return telefonosDe(p).some((t) => soloDigitos(t).includes(buscado));
}
