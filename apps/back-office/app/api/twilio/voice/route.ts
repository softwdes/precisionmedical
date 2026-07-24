import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_PHONE_NUMBER } from '@/lib/twilio-server';

const { VoiceResponse } = twilio.twiml;

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

// Twilio llama este webhook cuando el browser Device inicia una llamada saliente.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const to   = form.get('To') as string | null;

    const twiml = new VoiceResponse();

    if (!to) {
      twiml.say({ language: 'es-MX' }, 'Número de destino no proporcionado.');
      return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    const toE164Num     = toE164(to);
    const callerE164    = TWILIO_PHONE_NUMBER ? toE164(TWILIO_PHONE_NUMBER) : undefined;

    const dial = twiml.dial({ callerId: callerE164, timeout: 30 });
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
