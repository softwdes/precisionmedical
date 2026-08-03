import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServerClient } from '@precision-medical/auth/server';
import { TWILIO_ACCOUNT_SID, TWILIO_TWIML_APP_SID } from '@/lib/twilio-server';

const { AccessToken } = twilio.jwt;
const { VoiceGrant }  = AccessToken;

/**
 * Identidad de Twilio del usuario logueado.
 *
 * Antes era la constante 'back-office-agent' para TODOS. Eso alcanza para las
 * llamadas salientes, pero bloquea todo lo de entrantes:
 *   - Twilio no puede enrutar una llamada a un usuario en particular
 *   - no se puede saber quién contestó → `CallLog.agentUserId` queda vacío
 *   - "Mis llamadas" / "Que yo contesté" no se pueden filtrar
 *
 * Twilio acepta letras, números y `-_.` en la identidad, así que el UUID de
 * Supabase entra tal cual. El prefijo `user-` deja lugar a identidades futuras
 * que no sean de persona (una cola, un bot).
 */
export function identityForUser(userId: string): string {
  return `user-${userId}`;
}

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
