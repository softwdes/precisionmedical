import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { TWILIO_TWIML_APP_SID } from '@/lib/twilio-server';

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

export async function POST() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const apiKeySid  = process.env.TWILIO_API_KEY_SID!;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET!;

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: 'back-office-agent',
      ttl: 3600,
    });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    return NextResponse.json({ token: token.toJwt() });
  } catch (err) {
    console.error('[twilio/token]', err);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
