/**
 * POST /api/changelog/seen
 *
 * Sella `users.lastSeenReleasesAt` en ahora: el usuario ya miro el buzon, asi
 * que el contador vuelve a cero y de aca en mas cuenta lo que se publique
 * despues.
 *
 * Lo llama la campana al ABRIR el panel, no al cerrarlo: si el usuario cierra
 * la pestaña mientras lee, igual lo dio por visto. Es el mismo criterio del
 * inbox de mensajes, y el costo de equivocarse es minimo — la nota no se
 * destruye, sigue en la historia del panel.
 *
 * Sin cuerpo: la marca es siempre `now()`. No se acepta una fecha del cliente,
 * que podria mandar una del futuro y apagarse el contador para siempre.
 */
import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // El id de Auth es un UUID y el de `users` un cuid: el puente es el email.
  const dbUser = await getDbUserByEmail(user.email);
  if (dbUser === null) return NextResponse.json({ error: 'NO_DB_USER' }, { status: 401 });

  const seenAt = new Date();
  await db.user.update({
    where: { id: dbUser.id },
    data: { lastSeenReleasesAt: seenAt },
  });

  return NextResponse.json(
    { ok: true, seenAt: seenAt.toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
