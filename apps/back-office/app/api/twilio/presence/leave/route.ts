/**
 * POST /api/twilio/presence/leave — el navegador se va.
 *
 * Existe aparte del `DELETE /api/twilio/presence` porque el aviso se manda con
 * `navigator.sendBeacon()` en `pagehide`, y sendBeacon SOLO hace POST: es la
 * única forma de que el pedido salga cuando la pestaña ya se está cerrando (un
 * `fetch` normal se cancela con el documento).
 *
 * Sin esto, la fila de presencia sobrevive hasta que vence el TTL y durante ese
 * rato el webhook le marca a un cliente muerto — el paciente escucha timbrar
 * contra nadie.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.callAgentPresence.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
