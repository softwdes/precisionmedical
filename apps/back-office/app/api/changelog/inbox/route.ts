/**
 * GET /api/changelog/inbox?portal=admin|doctor|attorney
 *
 * El buzon de la campana: la historia reciente de notas de release para la
 * audiencia del usuario, MAS cuantas no vio todavia (lo que cuenta el badge).
 *
 * Distinto de `/api/changelog`, que responde "que cambio desde que arranco esta
 * pestaña" y se muestra una sola vez despues del reload. Este se abre cuando el
 * usuario quiere y no destruye nada al cerrarse.
 *
 * `portal` es una PISTA, no una orden: el cliente sabe en que portal esta (por
 * su pathname) pero no decide que puede leer. `resolverAudiencia` lo valida
 * contra la sesion y cae a la audiencia principal si no corresponde.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@precision-medical/database';
import { getInbox } from '@precision-medical/database/release-notes';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { resolverAudiencia } from '@/lib/release-audience';

export const dynamic = 'force-dynamic';

const APP = 'back-office';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const audience = await resolverAudiencia(req.nextUrl.searchParams.get('portal'));
  if (audience === null) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // El id de Auth es un UUID y el de `users` un cuid: no son el mismo. La fila
  // de Phoenix se resuelve por email, que es el puente de siempre.
  const dbUser = await getDbUserByEmail(user.email);
  if (dbUser === null) return NextResponse.json({ error: 'NO_DB_USER' }, { status: 401 });

  const marca = await db.user.findUnique({
    where: { id: dbUser.id },
    select: { lastSeenReleasesAt: true },
  });

  // Mismo origen que el resto de la UI: la cookie que setea el switcher del
  // Topbar. El default es 'en', igual que `i18n/request.ts`.
  const locale = (await cookies()).get('locale')?.value === 'es' ? 'es' : 'en';

  const inbox = await getInbox({ app: APP, audience, locale, seenAt: marca?.lastSeenReleasesAt ?? null });

  return NextResponse.json(
    {
      audience,
      unseen: inbox.unseen,
      count: inbox.count,
      notes: inbox.notes,
      debut: inbox.debut,
      since: inbox.since.toISOString(),
    },
    // Depende del usuario y del momento: nunca en CDN.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
