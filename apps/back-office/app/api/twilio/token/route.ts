import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_TWIML_APP_SID } from '@/lib/twilio-server';

const { AccessToken } = twilio.jwt;
const { VoiceGrant }  = AccessToken;

export async function POST() {
  try {
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      { identity: 'back-office-agent', ttl: 3600 },
    );
    token.addGrant(new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    }));
    return NextResponse.json({ token: token.toJwt() });
  } catch (err) {
    console.error('[twilio/token]', err);
    return NextResponse.json({ error: 'token_failed' }, { status: 500 });
  }
}
