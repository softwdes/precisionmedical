/**
 * El estado de un correo, preguntado a Twilio.
 *
 * ── Por qué se PREGUNTA en vez de esperar un aviso ─────────────────────────
 *
 * Porque para el correo no hay aviso. El SMS tiene su `StatusCallback` por
 * mensaje y funciona —432 entregados y confirmaciones todos los días—, pero la
 * API nativa de correo (`comms.twilio.com/v1/Emails`) no expone dónde poner un
 * webhook: el Event Webhook que documenta Twilio pertenece a la consola de
 * SendGrid, que esta cuenta no usa. Erick lo buscó y no está.
 *
 * Medido el 2026-10-07 contra la base: **247 correos desde el 14-sep y CERO
 * filas tocadas después de nacer**. Ni un evento, nunca. No es que se pierdan
 * en el camino — no existe el camino.
 *
 * Lo que sí documenta Twilio es consultar la operación:
 *
 *     GET https://comms.twilio.com/v1/Emails/Operations/{operationId}
 *
 * y eso lo podemos hacer porque el `operationId` ya lo guardamos al enviar, en
 * `providerMessageId` (244 de 247 filas lo tienen).
 *
 * ── El reloj de 7 días ──────────────────────────────────────────────────────
 *
 * ⚠️ Twilio conserva la operación **7 días**. Pasado eso, el correo queda sin
 * respuesta posible: no es que no sepamos todavía, es que ya no se puede saber.
 * El 7-oct había 134 correos ya vencidos y 110 todavía rescatables. Por eso
 * esto corre seguido y no a pedido: cada día que pasa sin consultar, un día de
 * correos se vuelve definitivamente ciego.
 */

import type { MessageStatus } from '@precision-medical/database';
import { TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET } from '@/lib/twilio-server';

const OPERACIONES = 'https://comms.twilio.com/v1/Emails/Operations';

/** Cuántos días conserva Twilio la operación. Pasado esto no hay respuesta. */
export const DIAS_DE_VENTANA = 7;

/** Lo que nos puede decir Twilio y nosotros guardamos. */
export type EstadoDeCorreo = 'SENT' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED';

/**
 * Qué estados puede PISAR cada uno.
 *
 * Vive acá y no en cada ruta porque hay DOS caminos que escriben el estado de
 * un correo —esta consulta y el webhook de SendGrid, si algún día se habilita—
 * y dos tablas de precedencia distintas terminan discrepando el día que una se
 * toca y la otra no ([[regla-un-solo-resolvedor-por-dato]]).
 *
 * `DELIVERED` es terminal: nada lo baja. Un `sent` que llega tarde no puede
 * borrar la única prueba de que el paciente lo recibió.
 */
export const PISA_CORREO: Record<EstadoDeCorreo, MessageStatus[]> = {
  SENT:        ['QUEUED'],
  FAILED:      ['QUEUED', 'SENT'],
  UNDELIVERED: ['QUEUED', 'SENT'],
  DELIVERED:   ['QUEUED', 'SENT', 'UNDELIVERED'],
};

/** Los contadores que devuelve la operación. Solo los que se usan. */
interface Stats {
  total?: number;
  recipients?: number;
  queued?: number;
  sent?: number;
  delivered?: number;
  undelivered?: number;
  failed?: number;
  canceled?: number;
}

export interface Operacion {
  status?: string;
  stats?: Stats;
  updatedAt?: string;
}

/**
 * Traducir los contadores a UN estado.
 *
 * Solo se traduce cuando la operación tiene **un destinatario**, que es como
 * manda esta app: con varios, `delivered: 1, undelivered: 1` no tiene un estado
 * único y elegir uno sería inventar. En ese caso se devuelve `null` y la fila
 * queda como está, que es honesto.
 *
 * El orden es por definitividad, no por preferencia: lo que falló manda sobre
 * lo que salió, y `delivered` manda sobre `sent` porque `sent` es solo "salió
 * de Twilio".
 */
export function estadoSegunStats(op: Operacion): EstadoDeCorreo | null {
  const s = op.stats;
  if (!s) return null;

  const destinatarios = s.recipients ?? s.total ?? 1;
  if (destinatarios > 1) return null;

  if ((s.failed ?? 0) > 0)      return 'FAILED';
  if ((s.undelivered ?? 0) > 0) return 'UNDELIVERED';
  if ((s.delivered ?? 0) > 0)   return 'DELIVERED';
  if ((s.sent ?? 0) > 0)        return 'SENT';
  return null;   // sigue en cola o programado: todavía no hay nada que decir
}

/**
 * Preguntarle a Twilio por una operación.
 *
 * Devuelve `null` cuando no hay respuesta útil, y distingue el 404 a propósito:
 * un 404 es "esta operación ya no existe" —se venció la ventana de 7 días— y
 * quien llama lo usa para dejar de reintentarla para siempre. Un 500 es
 * "preguntá más tarde". Tratarlos igual haría reintentar eternamente lo que ya
 * no se puede saber.
 */
export async function consultarOperacion(
  operationId: string,
): Promise<{ ok: true; operacion: Operacion } | { ok: false; vencida: boolean }> {
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) return { ok: false, vencida: false };

  const auth = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${OPERACIONES}/${encodeURIComponent(operationId)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[estado-correo] no se pudo consultar %s:', operationId, e);
    return { ok: false, vencida: false };
  }

  if (res.status === 404) return { ok: false, vencida: true };
  if (!res.ok) {
    console.error('[estado-correo] Twilio respondió %s para %s', res.status, operationId);
    return { ok: false, vencida: false };
  }

  const operacion = await res.json().catch(() => null) as Operacion | null;
  return operacion ? { ok: true, operacion } : { ok: false, vencida: false };
}
