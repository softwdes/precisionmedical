import { randomBytes } from 'crypto';
import { db } from '@precision-medical/database';

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

/** El link que se le manda al paciente. */
export function urlDelPortal(token: string): string {
  // Phase 1A: localhost · Phase 2: forms.lienmaster.net
  // Ruta /c/[token] = wizard completo (B.5-B.8) · /intake/[token] = legacy 4 pasos
  const base = process.env.PORTAL_URL ?? 'http://localhost:3004';
  return `${base}/c/${token}`;
}

export interface TokenDelCaso {
  token: string;
  portalUrl: string;
  /** `false` cuando se acaba de emitir uno nuevo (el anterior, si había, murió). */
  reusado: boolean;
}

/**
 * El token vivo del caso — **se reusa, no se re-emite**.
 *
 * ── El bug que esto cierra ──────────────────────────────────────────────────
 *
 * `cases.portalToken` es UNA columna, y las dos rutas que la escriben emitían
 * un token nuevo siempre. Como el link viaja por SMS y se queda en el teléfono
 * del paciente, cada emisión nueva mataba en silencio a la anterior. Había tres
 * formas de romperle el link a alguien sin enterarse:
 *
 *  1. Abrir el diálogo del QR de un caso. `IntakeFormLinkDialog` llamaba a
 *     `generate-portal-token` en un `useEffect` al abrir — solo MIRAR el caso
 *     invalidaba el SMS que el paciente ya tenía. Es lo que le pasó al caso
 *     MVA-3316: SMS a las 13:41, alguien abrió el QR a las 16:53, link muerto.
 *  2. Reenviar el link. El envío nuevo mataba al anterior.
 *  3. Mandarlo por Email y SMS a la vez: `new-case-dialog` dispara los dos
 *     canales en un `Promise.all` y cada llamada emitía SU token. Se ve en los
 *     datos — el caso GM-3312 tiene un token en el SMS y otro en la DB,
 *     emitidos con 4 ms de diferencia. El email ganó y el SMS nació muerto.
 *
 * Medido el 2026-09-01: de 87 SMS con link de portal, **56 (64%) llevaban un
 * token que ya no existía**.
 *
 * El criterio de reusar no es nuevo en el repo: es el mismo que ya está escrito
 * en el encabezado de `appointments/[id]/sign-token` ("Se REUSA mientras siga
 * vivo... emitir uno nuevo en cada apertura del modal rompe el caso real").
 * Nunca se había aplicado acá.
 *
 * ── Por qué `updateMany` y no `update` ──────────────────────────────────────
 *
 * Leer-y-después-escribir no alcanza para el caso 3: las dos llamadas del
 * `Promise.all` pueden leer `null` a la vez y emitir cada una la suya. El
 * `where` con `portalToken: null` hace que la condición y la escritura sean la
 * MISMA operación: gana una sola, y la que pierde (`count === 0`) relee y usa
 * la del ganador. Las dos terminan mandando el mismo link vivo.
 *
 * ⚠️ Sigue sin vencer — ver el aviso de `generarPortalToken`. Reusar no empeora
 * eso: el token de hoy tampoco vencía, solo moría por accidente. Que el SMS
 * prometa "expira en 24 h" y no sea cierto es la decisión que queda abierta.
 *
 * @param revocarElAnterior Emite uno nuevo a propósito y mata el que había. Es
 *   la única forma de invalidar un link ya entregado, y tiene que ser un acto
 *   explícito del staff — no el efecto colateral de abrir una pantalla.
 * @returns `null` si el caso no existe.
 */
export async function obtenerPortalToken(
  caseId: string,
  { revocarElAnterior = false }: { revocarElAnterior?: boolean } = {},
): Promise<TokenDelCaso | null> {
  if (!revocarElAnterior) {
    const actual = await db.case.findUnique({
      where:  { id: caseId },
      select: { portalToken: true },
    });
    if (!actual) return null;
    if (actual.portalToken) {
      return { token: actual.portalToken, portalUrl: urlDelPortal(actual.portalToken), reusado: true };
    }
  }

  const nuevo = generarPortalToken();

  const escrito = await db.case.updateMany({
    where: revocarElAnterior ? { id: caseId } : { id: caseId, portalToken: null },
    data:  { portalToken: nuevo },
  });

  if (escrito.count === 1) {
    return { token: nuevo, portalUrl: urlDelPortal(nuevo), reusado: false };
  }

  // `count === 0`: o el caso no existe, o otra llamada simultánea lo escribió
  // primero. Lo que valga en la DB es el token bueno — el nuestro se descarta.
  const final = await db.case.findUnique({
    where:  { id: caseId },
    select: { portalToken: true },
  });
  if (!final?.portalToken) return null;
  return { token: final.portalToken, portalUrl: urlDelPortal(final.portalToken), reusado: true };
}
