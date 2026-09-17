/**
 * Los campos migrados del v2 que pueden seguir guardados cifrados (`e:…`), y el
 * freno que impide que un formulario público los borre sin querer.
 *
 * Vivía adentro de `app/api/intake/[token]/route.ts`. Se sacó acá cuando la
 * pantalla de confirmación de cita (`/confirmar/[token]`) empezó a escribir los
 * MISMOS campos del paciente: dos rutas escribiendo `addressCity` con una sola
 * de las dos protegida es cómo se pierde un dato para siempre, y el bug sería
 * invisible hasta que alguien configure la clave y descubra que ya no hay nada
 * que descifrar.
 */

import { isCipher } from './decrypt';

/**
 * Campos de la data migrada del v2 que pueden seguir cifrados (`e:…`).
 *
 * Sin la clave `AES_GCM_KEY_B64` en el entorno, el GET los manda como null y el
 * formulario los pinta vacíos — si el paciente guarda ese vacío, el cifrado se
 * iría a NULL y no habría cómo recuperarlo ni configurando la clave después.
 */
export const MAYBE_CIPHER = [
  'employer', 'preferredPharmacy',
  'addressCity', 'addressState', 'addressZip',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
  'emergency2Relation', 'guardianRelation',
] as const;

/**
 * Descarta del update los campos que llegan vacíos cuando lo guardado sigue
 * cifrado. Un vacío ahí significa "no pude mostrarte esto", no "borralo": el
 * paciente nunca vio el valor, así que no puede estar decidiendo eliminarlo.
 * Si escribe algo de verdad, ese valor sí gana y reemplaza el cifrado.
 */
export function protegerCifrados(
  data: Record<string, unknown>,
  guardado: Record<string, string | null>,
): void {
  for (const campo of MAYBE_CIPHER) {
    if (campo in data && !data[campo] && isCipher(guardado[campo])) {
      delete data[campo];
    }
  }
}
