/**
 * Ventana de presencia de agentes — compartida entre cliente y servidor.
 *
 * Vive en su propio archivo, y NO en `lib/twilio-server.ts`, porque el hook del
 * navegador la necesita: `twilio-server.ts` instancia el cliente de Twilio con
 * las credenciales al importarse, y arrastrarlo al bundle del cliente metería
 * secretos donde no van.
 */

/** Cada cuánto avisa el navegador que sigue disponible para recibir. */
export const PRESENCE_HEARTBEAT_MS = 60_000;

/**
 * Cuánto vale una fila de presencia antes de considerarse muerta.
 *
 * 2.5× el intervalo: tolera un latido perdido por una request lenta sin sacar a
 * la persona del ring group, pero deja de marcarle rápido si cerró la pestaña —
 * marcarle a un cliente muerto solo hace esperar al paciente contra nadie.
 */
export const PRESENCE_TTL_MS = 150_000;
