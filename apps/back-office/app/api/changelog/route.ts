/**
 * GET /api/changelog?since=<sha>&audience=<a>
 *
 * Lo que se publicó desde el build que tiene el usuario. Lo pide el modal que
 * aparece DESPUÉS del reload del banner "Actualizar".
 *
 * Cada app tiene su propio deploy, así que cada una expone esta ruta; la query
 * vive en `@precision-medical/database/release-notes` para no duplicarla seis
 * veces.
 *
 * Sobre `audience`: es un filtro de PRESENTACIÓN, no una frontera de
 * autorización. Lo manda el cliente porque sólo él sabe en qué portal está
 * (back-office sirve tres desde tres route groups). Es aceptable porque nada
 * sensible sobrevive a la publicación: las entradas marcadas van con `hidden` y
 * el publish es manual. Aun así pide sesión — no es público.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getChangelog } from '@precision-medical/database/release-notes';
import { isAudience } from '@precision/release/audience';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const APP = 'back-office';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (user === null) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const since = req.nextUrl.searchParams.get('since');
  const audience = req.nextUrl.searchParams.get('audience');
  // Ancla temporal: lo que de verdad decide desde cuándo contar.
  const bootAt = req.nextUrl.searchParams.get('bootAt') ?? undefined;

  if (since === null || audience === null || !isAudience(audience)) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  // Mismo origen que el resto de la UI: la cookie que setea el switcher del
  // Topbar. El default es 'en', igual que `i18n/request.ts`.
  const locale = (await cookies()).get('locale')?.value === 'es' ? 'es' : 'en';

  const { modules, count } = await getChangelog({ app: APP, since, bootAt, audience, locale });

  return NextResponse.json(
    { modules, count, audience, locale },
    // Depende del usuario y del momento: nunca en CDN.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
