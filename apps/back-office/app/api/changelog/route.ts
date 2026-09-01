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
 * Sobre `audience`: el cliente la manda porque solo el sabe en que portal esta
 * —back-office sirve tres desde tres route groups y el layout no recibe la URL—,
 * pero es una PISTA. `resolverAudiencia` la valida contra la sesion y cae a la
 * audiencia principal si no le corresponde.
 *
 * Antes se tomaba tal cual, con el argumento de que nada sensible sobrevive a la
 * publicacion. Ese argumento se cayo dos veces: `hidden` estuvo en 0 en toda la
 * tabla hasta el 2026-09-01 porque la red de scopes sensibles estaba solo en
 * ingles, y el publish dejo de ser manual hace rato (el build auto-publica). Con
 * el portal legal ahora habilitado en el middleware, confiar en el parametro
 * dejaria a un abogado leerse las notas internas de la clinica.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getChangelog } from '@precision-medical/database/release-notes';
import { resolverAudiencia } from '@/lib/release-audience';
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

  if (since === null) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  // La audiencia que manda el cliente es una PISTA, no una orden: `resolverAudiencia`
  // la valida contra la sesion y cae a la principal si no le corresponde.
  //
  // Antes se tomaba tal cual. Con el portal legal habilitado en el middleware —lo
  // que hace falta para que su modal de novedades cargue— eso dejaria a un abogado
  // leerse las notas internas de la clinica cambiando un query param.
  const efectiva = await resolverAudiencia(audience);
  if (efectiva === null) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // Mismo origen que el resto de la UI: la cookie que setea el switcher del
  // Topbar. El default es 'en', igual que `i18n/request.ts`.
  const locale = (await cookies()).get('locale')?.value === 'es' ? 'es' : 'en';

  const { modules, count } = await getChangelog({ app: APP, since, bootAt, audience: efectiva, locale });

  return NextResponse.json(
    { modules, count, audience: efectiva, locale },
    // Depende del usuario y del momento: nunca en CDN.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
