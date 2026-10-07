/**
 * POST /api/twilio/email-status — qué pasó con un correo.
 *
 * El gemelo de `twilio/sms-status`, y existe por lo mismo: el POST a la Email
 * API devuelve 202 Accepted, que significa "Twilio lo tomó" y nada más. Sin
 * esto, la fila queda en `QUEUED` **para siempre**.
 *
 * Medido el 2026-09-28, antes de esta ruta: **108 correos en QUEUED y ninguno
 * confirmado**, contra 143 SMS en DELIVERED. No es que el correo anduviera
 * peor — es que del SMS sabíamos y del correo no. Y los avisos que más
 * importan (la reprogramación y el recordatorio de 24 h) salían por ahí, así
 * que "le avisamos" era una suposición.
 *
 * ── Con qué se corresponde cada evento ─────────────────────────────────────
 *
 * ⚠️ El identificador NO empata. Nosotros guardamos el `operationId` que
 * devuelve `comms.twilio.com/v1/Emails`; el evento trae `sg_message_id`, que
 * es el de SendGrid. Son numeraciones distintas y no hay tabla que las una.
 *
 * Por eso se empareja por DESTINATARIO: la fila de correo más reciente a esa
 * dirección que todavía no esté confirmada. Es suficiente porque a una misma
 * dirección no le salen dos correos en el mismo segundo, y el margen de error
 * —dos avisos al mismo paciente con minutos de diferencia— confunde dos filas
 * del registro, no el estado de la cita.
 *
 * Si algún día el `operationId` aparece en el evento, emparejar por ahí y
 * borrar esta heurística.
 *
 * ── Cómo se autentica ──────────────────────────────────────────────────────
 *
 * Con un secreto en la URL (`?token=`), no con la firma de SendGrid: la firma
 * usa ECDSA con una clave que se descarga de la consola y que acá no tenemos, y
 * el `TWILIO_AUTH_TOKEN` que valida el webhook del SMS no sirve para estos
 * eventos. El secreto en la URL lo controlamos nosotros y se configura al dar
 * de alta el Event Webhook.
 *
 * Sin `EMAIL_STATUS_WEBHOOK_SECRET` cargado la ruta NO acepta nada: un
 * "delivered" falso es peor que no tener el dato, porque se lee como prueba de
 * que el paciente fue avisado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { PISA_CORREO } from '@/lib/estado-correo';

export const dynamic = 'force-dynamic';

/** SendGrid reintenta si no ve un 2xx, así que se responde 200 siempre. */
const ok = () => new NextResponse('', { status: 200 });

/** Un evento del Event Webhook. Solo los campos que se usan. */
interface EventoCorreo {
  email?: string;
  event?: string;
  timestamp?: number;
  reason?: string;
  status?: string;
  type?: string;
}

/**
 * El evento de SendGrid a nuestro estado.
 *
 * Los de ENGAGEMENT (`open`, `click`) se ignoran a propósito, y no por
 * simplificar: registrar que un paciente abrió un correo de su cita es
 * guardar una interacción con PHI que nadie pidió y que no cambia si el
 * mensaje llegó — `delivered` ya lo contesta.
 */
function mapear(evento: string | undefined): 'SENT' | 'DELIVERED' | 'UNDELIVERED' | null {
  switch (evento) {
    case 'processed': return 'SENT';
    // Rebotado por el servidor del destinatario, o frenado por SendGrid antes
    // de salir (dirección en la lista de rebotes, spam previo). En los dos
    // casos el paciente no lo tiene.
    case 'deferred':  return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'bounce':
    case 'dropped':   return 'UNDELIVERED';
    default:          return null;
  }
}

/**
 * La tabla de precedencia vive en `lib/estado-correo.ts`.
 *
 * Dos caminos escriben el estado de un correo —este webhook y la consulta
 * por operación del cron, que es la que hoy trae los datos— y dos copias de
 * esta tabla terminan discrepando el día que se toca una sola.
 */
const PISA = PISA_CORREO;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secreto = process.env.EMAIL_STATUS_WEBHOOK_SECRET;
    if (!secreto) {
      console.error('[twilio/email-status] sin EMAIL_STATUS_WEBHOOK_SECRET: se descarta todo');
      return ok();
    }
    if (req.nextUrl.searchParams.get('token') !== secreto) {
      console.error('[twilio/email-status] token invalido — descartado');
      return ok();
    }

    const cuerpo = await req.json().catch(() => null);
    // El Event Webhook siempre manda un ARRAY, incluso con un solo evento.
    const eventos: EventoCorreo[] = Array.isArray(cuerpo) ? cuerpo : [];
    if (eventos.length === 0) return ok();

    for (const ev of eventos) {
      const destino = ev.email?.trim();
      const estado  = mapear(ev.event);
      if (!destino || !estado) continue;

      /**
       * La fila que le corresponde: el correo más reciente a esa dirección que
       * todavía no llegó a un estado más avanzado que éste. El filtro por
       * `status` es lo que hace que los eventos fuera de orden —`processed`
       * después de `delivered`, que pasa— no retrocedan el registro.
       */
      const fila = await db.messageLog.findFirst({
        where: {
          channel: 'EMAIL',
          toAddress: destino,
          status: { in: PISA[estado] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (!fila) {
        console.warn('[twilio/email-status] evento "%s" para %s sin fila que actualizar', ev.event, destino);
        continue;
      }

      await db.messageLog.update({
        where: { id: fila.id },
        data: {
          status: estado,
          ...(estado === 'DELIVERED'
            ? { deliveredAt: ev.timestamp ? new Date(ev.timestamp * 1000) : new Date() }
            : {}),
          ...(ev.reason ? { errorMessage: `${ev.event}: ${ev.reason}` } : {}),
        },
      });

      if (estado === 'UNDELIVERED') {
        // Ruidoso a propósito, igual que en el SMS: un correo que rebota es un
        // paciente que NO se enteró, y alguien tiene que llamarlo.
        console.error('[twilio/email-status] NO ENTREGADO a %s · %s · %s',
          destino, ev.event, ev.reason ?? ev.status ?? '-');
      }
    }

    return ok();
  } catch (err) {
    console.error('[twilio/email-status] error:', err);
    return ok();
  }
}
