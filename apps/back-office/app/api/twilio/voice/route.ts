import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_PHONE_NUMBER, userIdFromIdentity } from '@/lib/twilio-server';
import { db } from '@precision-medical/database';
import { toE164, phoneKey } from '@/lib/phone';

const { VoiceResponse } = twilio.twiml;

// Twilio llama este webhook cuando el browser Device inicia una llamada saliente.
export async function POST(req: NextRequest) {
  try {
    const form    = await req.formData();
    const to        = form.get('To')        as string | null;
    const callSid   = form.get('CallSid')   as string | null;
    const from      = form.get('From')      as string | null;
    const agentName = form.get('AgentName') as string | null;

    const twiml = new VoiceResponse();

    if (!to) {
      twiml.say({ language: 'es-MX' }, 'Número de destino no proporcionado.');
      return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    const toE164Num  = toE164(to);
    const callerE164 = TWILIO_PHONE_NUMBER ? toE164(TWILIO_PHONE_NUMBER) : undefined;

    // ─── Freno anti-bucle ────────────────────────────────────────────────────
    //
    // Si el destino es NUESTRO propio número, esto no es una saliente: es una
    // llamada ENTRANTE que llegó al webhook equivocado. Pasó de verdad el
    // 2026-08-05 — el número tenía "A call comes in" apuntando acá en vez de a
    // `/api/twilio/incoming`, y cada entrante se marcaba a sí misma: 11
    // llamadas en 7 segundos, cada vuelta facturada, y el paciente escuchando
    // timbrar sin que nadie pudiera atender.
    //
    // El `<Dial>` sale ANTES de que nadie pueda notarlo, así que el freno tiene
    // que estar en el código y no solo en la configuración de la consola.
    if (callerE164 && phoneKey(toE164Num) === phoneKey(callerE164)) {
      console.error(
        '[twilio/voice] BUCLE EVITADO: llegó una llamada a %s con destino a nuestro propio número. ' +
        'El webhook "A call comes in" del número debe apuntar a /api/twilio/incoming, no acá.',
        toE164Num,
      );
      twiml.say({ language: 'es-MX', voice: 'Polly.Mia' },
        'La configuración del sistema telefónico está incompleta. Por favor intente más tarde.');
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }

    // Quién marcó. `From` viene como `client:user-<supabaseUserId>` porque el
    // token ahora emite identidad por usuario (fase 1). Lo firma Twilio, así
    // que es confiable — el `AgentName` del `device.connect()` no lo es, viaja
    // desde el navegador. Sin esto `agentUserId` quedaba siempre null y las
    // pestañas "Mis llamadas" / "Que yo contesté" no podían filtrar nada.
    const agentUserId = userIdFromIdentity(from);

    // Crear el registro de llamada — el status callback lo actualizará con el outcome final
    if (callSid) {
      await db.callLog.create({
        data: {
          twilioCallSid:   callSid,
          direction:       'OUTBOUND',
          // En salientes el origen real es NUESTRO número de Twilio: guardar
          // `client:user-<uuid>` acá dejaba una columna de teléfono con un id
          // adentro, imposible de mostrar y de comparar.
          fromNumber:      callerE164 ?? from ?? '',
          toNumber:        toE164Num,
          outcome:         'IN_PROGRESS',
          agentUserId,
          agentName:       agentName || null,
        },
      }).catch((e) => console.error('[twilio/voice] callLog.create failed:', e));
    }

    const dial = twiml.dial({
      callerId:        callerE164,
      timeout:         30,
      action:          '/api/twilio/call-status',
    });
    dial.number(toE164Num);

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  } catch (err) {
    console.error('[twilio/voice] error:', err);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ language: 'es-MX' }, 'Error interno. Por favor intente nuevamente.');
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
}
