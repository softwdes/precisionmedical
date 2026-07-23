import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_PHONE_NUMBER } from '@/lib/twilio-server';

const { VoiceResponse } = twilio.twiml;

// Twilio calls this webhook when the browser client initiates an outbound call.
// We respond with TwiML that dials the destination number.
export async function POST(req: NextRequest) {
  const body = await req.formData();
  const to   = body.get('To') as string | null;

  const twiml = new VoiceResponse();

  if (!to) {
    twiml.say('No destination number provided.');
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const dial = twiml.dial({ callerId: TWILIO_PHONE_NUMBER });
  dial.number(to);

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}
