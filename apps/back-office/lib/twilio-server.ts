import twilio from 'twilio';

// Autenticación con API Key (no requiere Auth Token)
export const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID!,
  process.env.TWILIO_API_KEY_SECRET!,
  { accountSid: process.env.TWILIO_ACCOUNT_SID! },
);

export const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID ?? '';
// La Email API de Twilio (comms.twilio.com) va por REST con Basic auth, no por
// el SDK, asi que necesita las API Keys sueltas ademas del cliente de arriba.
export const TWILIO_API_KEY_SID    = process.env.TWILIO_API_KEY_SID ?? '';
export const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET ?? '';
export const TWILIO_PHONE_NUMBER  = process.env.TWILIO_PHONE_NUMBER ?? '';
export const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID ?? '';

/**
 * Messaging Service de Twilio — por acá salen los SMS.
 *
 * El registro A2P 10DLC ata la campaña aprobada a un Messaging Service, no al
 * número suelto. Mandar con `from: <numero>` se saltea esa campaña, y es una
 * de las causas típicas de que el operador filtre mensajes con la campaña YA
 * aprobada. Si está seteado, `lib/sms.ts` lo usa en lugar del número.
 */
export const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID ?? '';

// La ventana de presencia vive en `lib/twilio-presence.ts`: el hook del
// navegador también la necesita, y este archivo no puede entrar al bundle del
// cliente porque instancia el cliente de Twilio con las credenciales.

// ─── Identidad de Twilio por usuario ─────────────────────────────────────────
//
// Viven acá y NO en `app/api/twilio/token/route.ts` por una restricción de
// Next.js: un route handler solo admite handlers (GET/POST/…) y campos de
// config como exports. Cualquier otro export rompe el build con
//   Type error: Route "app/api/twilio/token/route.ts" does not match the
//   required types of a Next.js Route. "identityForUser" is not a valid
//   Route export field.
// `tsc --noEmit` NO lo detecta — esa validación la genera `next build`.

/**
 * Identidad de Twilio del usuario logueado.
 *
 * Antes era la constante 'back-office-agent' para TODOS. Eso alcanza para las
 * llamadas salientes, pero bloquea todo lo de entrantes:
 *   - Twilio no puede enrutar una llamada a un usuario en particular
 *   - no se puede saber quién contestó → `CallLog.agentUserId` queda vacío
 *   - "Mis llamadas" / "Que yo contesté" no se pueden filtrar
 *
 * Twilio acepta letras, números y `-_.` en la identidad, así que el UUID de
 * Supabase entra tal cual. El prefijo `user-` deja lugar a identidades futuras
 * que no sean de persona (una cola, un bot).
 */
export function identityForUser(userId: string): string {
  return `user-${userId}`;
}

/**
 * Inversa de `identityForUser`.
 *
 * Twilio manda el `From` de una llamada iniciada por el navegador como
 * `client:<identity>`. Ese valor lo firma Twilio, no el cliente, así que es la
 * forma NO falsificable de saber qué usuario marcó — a diferencia de un
 * parámetro custom del `device.connect()`, que cualquiera puede editar.
 *
 * Acepta tanto `client:user-<id>` como `user-<id>` pelado.
 * Devuelve null si no sigue la convención (números reales, colas, bots).
 */
export function userIdFromIdentity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const identity = raw.startsWith('client:') ? raw.slice('client:'.length) : raw;
  if (!identity.startsWith('user-')) return null;
  return identity.slice('user-'.length) || null;
}
