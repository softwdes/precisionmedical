/**
 * POST /api/twilio/sms-incoming — el paciente RESPONDE un mensaje.
 *
 * ⚠️ Esta ruta no existía. Hasta el 2026-09-28 el sistema solo sabía mandar:
 * `twilio/sms-status` trae acuses de entrega y `twilio/incoming` es de VOZ.
 * Un SMS entrante llegaba a Twilio y, sin webhook configurado, se descartaba.
 * Por eso nuestros mensajes dicen "no responda" — no era cortesía, es que no
 * había bandeja detrás. Si alguien contestó "no puedo el martes", nadie lo vio.
 *
 * ⚠️ Se configura en el NÚMERO, no en el TwiML App, y en la casilla de
 * MENSAJES, no en la de llamadas. Son tres configuraciones distintas en la
 * misma pantalla de Twilio y confundirlas es el error clásico:
 *   - TwiML App → Voice URL           → `/api/twilio/voice`         (llamadas salientes)
 *   - Número    → "A call comes in"   → `/api/twilio/incoming`      (llamadas entrantes)
 *   - Número    → "A message comes in"→ `/api/twilio/sms-incoming`  (ESTA)
 *
 * ── No contesta nada ───────────────────────────────────────────────────────
 *
 * Devuelve un TwiML vacío a propósito. Una autorespuesta ("recibimos tu
 * mensaje") le enseña al paciente que del otro lado hay un robot, y el objetivo
 * es exactamente el contrario: que alguien lo lea. El aviso de que hay algo sin
 * leer va para adentro, no para afuera.
 *
 * ── STOP y HELP los contesta Twilio ────────────────────────────────────────
 *
 * Las palabras de baja (STOP, UNSUBSCRIBE, CANCEL…) y de ayuda las maneja el
 * operador ANTES de llegar acá, y bloquea el número solo. Igual se guardan: un
 * "STOP" es el dato más importante que puede mandar un paciente —explica por qué
 * dejó de recibir recordatorios— y perderlo deja a recepción sin saber por qué
 * sus mensajes no llegan.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { findPatientsByPhone } from '@/lib/patient-phone-lookup';
import { readTwilioWebhook } from '@/lib/twilio-server';

export const dynamic = 'force-dynamic';

/** TwiML vacío: recibido, sin responder nada. */
const sinRespuesta = () =>
  new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    /**
     * Sin firma válida no entra. Un POST falsificado acá mete en la ficha
     * clínica de un paciente un mensaje que nunca escribió, y alguien del staff
     * va a actuar sobre eso.
     */
    const webhook = await readTwilioWebhook(req, process.env.TWILIO_SMS_INCOMING_URL);
    if (!webhook.ok) return new NextResponse('forbidden', { status: 403 });

    const form = webhook.form;
    const from = (form.get('From') as string | null) ?? '';
    const to   = (form.get('To')   as string | null) ?? '';
    const sid  = (form.get('MessageSid') as string | null) ?? '';
    const body = (form.get('Body') as string | null) ?? '';

    if (!sid) {
      console.error('[twilio/sms-incoming] sin MessageSid — descartado');
      return sinRespuesta();
    }

    /**
     * Reconocer a quien escribe. Misma regla que las llamadas entrantes: si el
     * número pertenece a VARIOS pacientes —familias que comparten línea, que acá
     * son muchas— no se elige uno. Vincular al azar mete un mensaje en la ficha
     * clínica de alguien que no lo escribió, y eso es peor que no vincular:
     * queda sin paciente y quien lo lea decide, viendo los candidatos.
     */
    const candidatos = await findPatientsByPhone(from);
    const patientId  = candidatos.length === 1 ? candidatos[0]!.id : null;

    /**
     * Si mandó una FOTO, no la traemos.
     *
     * Twilio deja la imagen en una URL suya y bajarla sería guardar PHI en un
     * canal sin BAA firmado —la misma pared que hoy tiene el correo—. Se anota
     * que venía algo adjunto para que quien lea sepa que el mensaje está
     * incompleto y levante el teléfono, y no se toca el archivo.
     */
    const adjuntos = Number.parseInt((form.get('NumMedia') as string | null) ?? '0', 10) || 0;
    const texto = adjuntos > 0
      ? `${body}\n\n[El paciente adjuntó ${adjuntos} archivo(s). No se guardan: llamar para verlos.]`.trim()
      : body;

    await db.messageLog.create({
      data: {
        providerMessageId: sid,
        channel:   'SMS',
        direction: 'INBOUND',
        /**
         * Un entrante ya llegó: nació DELIVERED. La máquina de estados de
         * `MessageStatus` describe el viaje de lo que mandamos nosotros, y
         * dejarlo en QUEUED —el default— lo mostraría como "esperando al
         * operador" a un mensaje que ya está acá.
         */
        status:      'DELIVERED',
        deliveredAt: new Date(),
        // Invertidos respecto de un saliente: el paciente es el remitente.
        toAddress:   to,
        fromAddress: from,
        body:        texto,
        patientId,
        // `readAt` queda en null a propósito: es lo que lo pone en la bandeja.
      },
    });

    if (!patientId) {
      // No es un error, pero hay que poder encontrarlo: un mensaje sin paciente
      // no aparece en ningún hilo y solo se ve en la bandeja general.
      console.warn('[twilio/sms-incoming] %s sin paciente (%d candidatos para %s)',
        sid, candidatos.length, from);
    }

    return sinRespuesta();
  } catch (err) {
    /**
     * Nunca 500: Twilio reintenta ante un error y volvería a entregar el mismo
     * mensaje, duplicándolo en la bandeja. Se responde bien y se grita en el log.
     */
    console.error('[twilio/sms-incoming] error:', err);
    return sinRespuesta();
  }
}
