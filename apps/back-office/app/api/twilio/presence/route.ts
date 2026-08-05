/**
 * POST /api/twilio/presence — heartbeat de un agente disponible para recibir.
 *
 * Twilio no expone qué clientes tiene registrados, así que el webhook de
 * entrantes no puede preguntarle a quién marcarle: la presencia la llevamos
 * nosotros. El navegador pega acá cada `PRESENCE_HEARTBEAT_MS` mientras la app
 * está abierta y el Device está registrado.
 *
 * DELETE la borra — el navegador la llama al cerrar la pestaña para que el
 * paciente no espere contra un cliente que ya no existe.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { getSessionUser } from '@/lib/session';
import { identityForUser } from '@/lib/twilio-server';
import { PRESENCE_HEARTBEAT_MS } from '@/lib/twilio-presence';

// Solo handlers y config pueden exportarse desde un route: las constantes de
// presencia viven en `lib/twilio-presence.ts` (rompía `next build`, ver b229a90).
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // El nombre se guarda desnormalizado para que el webhook pueda escribir
  // `CallLog.agentName` sin ir a buscarlo mientras el paciente espera.
  let agentName: string | null = null;
  try {
    const { data } = await createAdminClient()
      .from('users')
      .select('firstName, lastName')
      .eq('email', user.email ?? '')
      .single();
    if (data) agentName = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || null;
  } catch { /* sin nombre: el CallLog se resuelve después por agentUserId */ }

  const identity = identityForUser(user.id);

  await db.callAgentPresence.upsert({
    where:  { userId: user.id },
    create: { userId: user.id, identity, agentName },
    update: { identity, agentName },
  });

  return NextResponse.json({ ok: true, identity, heartbeatMs: PRESENCE_HEARTBEAT_MS });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // `deleteMany` y no `delete`: si no hay fila, no es un error.
  await db.callAgentPresence.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
