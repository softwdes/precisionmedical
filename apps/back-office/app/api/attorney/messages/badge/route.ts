/**
 * GET /api/attorney/messages/badge → el contador del sobre en la barra del
 * portal legal: `{ total, unread, urgentUnread }`.
 *
 * El sobre de la barra llamaba a `/api/messages/badge`, que el middleware le
 * prohíbe al rol LAWYER: con "ver como bufete" funcionaba (el que mira es
 * admin) y a un abogado REAL le fallaba en silencio. Esta es su puerta.
 *
 * Cuenta SOLO la carpeta Recibidos, con el criterio único de
 * `lib/mensajeria/bandeja-abogado.ts`: el mismo número que la pestaña y el menú.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';
import { contarRecibidos } from '@/lib/mensajeria/bandeja-abogado';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });

  return NextResponse.json(await contarRecibidos(actor.actorUserId));
}
