/**
 * Sentinel · el alcance.
 *
 * En Vigía el alcance es `SessionLawyer` y hace un trabajo: **encierra** al
 * abogado en su bufete. Acá no encierra nada — recepción ve la clínica entera —
 * así que este tipo existe por otra razón: **para que sea imposible mandarle al
 * prompt algo que no sea el nombre de quien pregunta.**
 *
 * Es a propósito más chico que la sesión. `getSessionUser()` devuelve el `User`
 * de Prisma completo, con email, teléfono y todo lo demás; si el prompt recibiera
 * ese objeto, cualquiera podría interpolarle un campo nuevo sin darse cuenta y
 * mandarlo al proveedor del modelo. Con estos dos campos, el prompt no tiene de
 * dónde agarrar nada más.
 *
 * `rol` no filtra datos (ninguna herramienta lo mira): sirve para que el agente
 * sepa a quién le habla. A la contadora le importa el saldo y a recepción la
 * cola, y el prompt puede ordenar la respuesta con eso.
 */
export interface AlcanceClinica {
  /** Para saludar. Es lo único identificable que llega al prompt. */
  nombre: string | null;
  /** Para el tono de la respuesta, no para el acceso. */
  rol: string;
}

/** El alcance a partir de la sesión, sin arrastrar el resto de la ficha. */
export function alcanceDe(user: { firstName?: string | null; role?: string | null }): AlcanceClinica {
  return { nombre: user.firstName ?? null, rol: user.role ?? 'EMPLOYEE' };
}
