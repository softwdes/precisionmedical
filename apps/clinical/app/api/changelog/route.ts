/**
 * GET /api/changelog?since=<sha>&bootAt=<iso>&audience=<a>
 *
 * Lo que se publicó desde que arrancó la pestaña. Lo pide el aviso que aparece
 * DESPUÉS del reload del banner "Actualizar".
 *
 * Cada app tiene su propio deploy, así que cada una expone esta ruta; la query
 * vive en `@precision-medical/database/release-notes` para no duplicarla.
 *
 * Sobre `audience`: es un filtro de PRESENTACIÓN, no una frontera de
 * autorización — clinical sirve al doctor (`/doctor`, `/visit`) y al mostrador
 * (`/checkin`, `/triage`), y sólo el cliente sabe dónde está. Es aceptable
 * porque nada sensible sobrevive a la publicación: lo marcado va con `hidden` y
 * lo que el parser no pudo decidir espera aprobación. Aun así pide sesión.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@precision-medical/auth/server';
import { getChangelog } from '@precision-medical/database/release-notes';
import { isAudience } from '@precision/release/audience';

export const dynamic = 'force-dynamic';

const APP = 'clinical';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const since = req.nextUrl.searchParams.get('since');
  const audience = req.nextUrl.searchParams.get('audience');
  const bootAt = req.nextUrl.searchParams.get('bootAt') ?? undefined;

  if (since === null || audience === null || !isAudience(audience)) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  const locale = (await cookies()).get('locale')?.value === 'es' ? 'es' : 'en';

  const { modules, count } = await getChangelog({ app: APP, since, bootAt, audience, locale });

  return NextResponse.json(
    { modules, count, audience, locale },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
