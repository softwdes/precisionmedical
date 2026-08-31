/**
 * POST /api/twilio/incoming — el paciente llama al número de la clínica.
 *
 * ⚠️ Este webhook va en el NÚMERO, no en el TwiML App. Son dos configuraciones
 * distintas en la consola de Twilio y confundirlas es el error clásico:
 *   - TwiML App  → Voice URL      → `/api/twilio/voice`      (salientes)
 *   - Número     → "A call comes in" → `/api/twilio/incoming` (entrantes)
 *
 * Qué hace:
 *   1. Reconoce al llamante buscando su número contra `phone`/`phone2`.
 *   2. Crea el `CallLog` (`INBOUND`) con el paciente si lo reconoció.
 *   3. Devuelve TwiML con un `<Client>` por cada agente presente — gana el
 *      primero que atiende (decisión de Erick).
 *
 * Si no hay nadie disponible NO manda a buzón: una grabación de llamada
 * clínica es PHI y el BAA con Twilio está pendiente. Se avisa y se corta.
 */

import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { db } from '@precision-medical/database';
import { findPatientsByPhone } from '@/lib/patient-phone-lookup';
import { PRESENCE_TTL_MS } from '@/lib/twilio-presence';
import { readTwilioWebhook } from '@/lib/twilio-server';

const { VoiceResponse } = twilio.twiml;

/**
 * Cuánto suena antes de darla por perdida. 25s son ~5 tonos: suficiente para
 * que alguien llegue al teclado, poco para que el paciente crea que nadie va a
 * atender nunca.
 */
const RING_TIMEOUT_SECONDS = 25;

/** Respuesta TwiML — Twilio ignora todo lo que no sea XML con este content-type. */
function twiml(res: InstanceType<typeof VoiceResponse>): NextResponse {
  return new NextResponse(res.toString(), {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const res = new VoiceResponse();

  try {
    // Sin firma válida no entra: este webhook crea un CallLog INBOUND y hace
    // sonar los teléfonos de todo el staff presente. Falsificarlo es inventar
    // una llamada de un paciente que nunca llamó.
    const webhook = await readTwilioWebhook(req, process.env.TWILIO_INCOMING_URL);
    if (!webhook.ok) return new NextResponse('forbidden', { status: 403 });

    const form    = webhook.form;
    const from    = (form.get('From')    as string | null) ?? '';
    const to      = (form.get('To')      as string | null) ?? '';
    const callSid = (form.get('CallSid') as string | null) ?? '';

    // ─── Reconocer al llamante ───────────────────────────────────────────────
    // Si el número pertenece a varios pacientes (familias que comparten línea)
    // NO se elige uno: vincular al azar mete un dato falso en la ficha clínica
    // de alguien. Queda sin vincular y quien atienda lo resuelve viendo el
    // historial, que sí muestra los candidatos.
    const candidates = await findPatientsByPhone(from);
    const patientId  = candidates.length === 1 ? candidates[0]!.id : null;

    // ─── Registrar la llamada ────────────────────────────────────────────────
    // Se crea ANTES de marcarle a nadie: si el proceso se cae o nadie atiende,
    // la llamada tiene que quedar registrada igual. El outcome final lo pone
    // `/api/twilio/call-status`, que ya funciona para entrantes sin cambios.
    if (callSid) {
      await db.callLog.create({
        data: {
          twilioCallSid: callSid,
          direction:     'INBOUND',
          fromNumber:    from,
          toNumber:      to,
          outcome:       'IN_PROGRESS',
          patientId,
        },
      }).catch((e) => console.error('[twilio/incoming] callLog.create failed:', e));
    }

    // ─── Ring group ──────────────────────────────────────────────────────────
    // Solo los agentes con presencia fresca. Marcarle a alguien que cerró la
    // pestaña hace que el paciente escuche timbrar contra nadie hasta agotar
    // el timeout.
    const agents = await db.callAgentPresence.findMany({
      where:  { lastSeenAt: { gte: new Date(Date.now() - PRESENCE_TTL_MS) } },
      select: { identity: true },
    });

    if (agents.length === 0) {
      // ── DECISIÓN ABIERTA (plan §7.1) ──────────────────────────────────────
      // Default deliberadamente conservador: avisar y cortar. Sin buzón ni
      // grabación, que es PHI y necesita el BAA con Twilio (plan §1).
      // Para desviar a un celular real de recepción, reemplazar este bloque
      // por `res.dial({...}).number('+1...')`.
      res.say({ language: 'es-MX', voice: 'Polly.Mia' },
        'Gracias por llamar a Precision Medical Care. En este momento no hay nadie disponible para atenderle. Por favor vuelva a llamar en horario de atención.');
      res.say({ language: 'en-US', voice: 'Polly.Joanna' },
        'Thank you for calling Precision Medical Care. No one is available right now. Please call back during business hours.');
      res.hangup();
      return twiml(res);
    }

    // `answerOnBridge` hace que el paciente escuche el ring real hasta que
    // alguien atiende, en vez de un silencio con la llamada ya "contestada".
    const dial = res.dial({
      answerOnBridge: true,
      timeout:        RING_TIMEOUT_SECONDS,
      action:         '/api/twilio/call-status',
    });
    for (const a of agents) dial.client(a.identity);

    return twiml(res);
  } catch (err) {
    console.error('[twilio/incoming] error:', err);
    // Nunca devolver un error crudo: Twilio le reproduce al paciente su propio
    // mensaje de fallo genérico, que suena a número fuera de servicio.
    const fallback = new VoiceResponse();
    fallback.say({ language: 'es-MX', voice: 'Polly.Mia' },
      'Estamos con un problema técnico. Por favor intente nuevamente en unos minutos.');
    fallback.hangup();
    return twiml(fallback);
  }
}
