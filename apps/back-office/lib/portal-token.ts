import { randomBytes } from 'crypto';

/**
 * Genera el `portalToken` de un caso — el magic link del intake.
 *
 * Vive en un archivo propio porque lo emiten DOS rutas (`generate-portal-token`
 * y `send-portal-link`) y hasta ahora cada una tenía su copia de la fórmula.
 * Un token que es la única puerta a la ficha completa de un paciente no puede
 * depender de que alguien se acuerde de arreglar las dos.
 *
 * ── Por qué no `Date.now()` + `Math.random()` ───────────────────────────────
 *
 * Era `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2,12)}`.
 * Las dos mitades son débiles y por motivos distintos:
 *
 *  · `Date.now()` no es secreto. Quien recibió su propio link sabe a qué hora
 *    se emitió, y los de los demás se emitieron cerca: el espacio a probar de
 *    esa mitad son milisegundos, no azar.
 *  · `Math.random()` NO es criptográfico. Es un PRNG pensado para barajar
 *    listas, sembrado por el proceso; V8 no da ninguna garantía de que no se
 *    pueda predecir a partir de salidas anteriores, y de hecho se puede.
 *
 * `randomBytes` sí es un CSPRNG: 24 bytes son 192 bits de entropía real, el
 * mismo criterio que ya usaba el kiosco de walk-in (`apps/forms`) y el que
 * eligió después el token de firma de cita.
 *
 * El prefijo `pt_` se conserva: aparece en los ejemplos del diálogo de envío y
 * hace evidente de un vistazo qué es esa cadena en un log o en la DB.
 *
 * ⚠️ Este token NO vence. La columna `cases.portalToken` no tiene par de
 * expiración, aunque las dos rutas devuelvan un `expiresAt` de 24 h y la UI se
 * lo muestre al staff. Es una decisión pendiente, no un olvido de este archivo
 * — comparar con `appointments.signToken`, que sí vence y sí se valida.
 */
export function generarPortalToken(): string {
  return `pt_${randomBytes(24).toString('base64url')}`;
}
