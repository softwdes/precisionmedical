import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_PHONE_NUMBER, userIdFromIdentity } from '@/lib/twilio-server';
import { db } from '@precision-medical/database';
import { toE164 } from '@/lib/phone';

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
