import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServerClient } from '@precision-medical/auth/server';
import { TWILIO_ACCOUNT_SID, TWILIO_TWIML_APP_SID, identityForUser } from '@/lib/twilio-server';

const { AccessToken } = twilio.jwt;
const { VoiceGrant }  = AccessToken;

// `identityForUser` / `userIdFromIdentity` viven en `lib/twilio-server.ts`:
// Next.js solo admite handlers y config como exports de un route handler, y
// exportarlos desde acá rompe `next build` (ver el comentario en ese archivo).

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const identity = identityForUser(user.id);

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      { identity, ttl: 3600 },
    );
    token.addGrant(new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    }));

    // Se devuelve la identidad junto al token: el cliente la necesita para saber
    // con qué nombre quedó registrado, y sirve para diagnosticar enrutamiento.
    return NextResponse.json({ token: token.toJwt(), identity });
  } catch (err) {
    console.error('[twilio/token]', err);
    return NextResponse.json({ error: 'token_failed' }, { status: 500 });
  }
}
