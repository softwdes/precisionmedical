/**
 * GET /api/changelog?since=<sha|v3.10>&bootAt=<iso>&audience=admin
 *
 * Lo publicado desde el ancla. Acá lo consume el aviso de versión que CIFO
 * muestra en el saludo del panel (`useNovedadDeVersion`).
 *
 * ── Por qué el Admin no la tenía ────────────────────────────────────────────
 *
 * Porque esta ruta nació para el aviso que aparece DESPUÉS del botón
 * "Actualizar", y el Admin monta el `UpdateBanner` pero no la campana de
 * novedades. Cada app expone la suya porque cada app tiene su propio deploy y
 * su propia fila en `releases`; la query vive una sola vez en
 * `@precision-medical/database/release-notes`.
 *
 * ── La audiencia acá es FIJA ────────────────────────────────────────────────
 *
 * Y es la diferencia con back-office, que la valida contra la sesión con
 * `resolverAudiencia`: allá conviven tres portales bajo el mismo dominio —el de
 * la clínica, el del provider y el del abogado— y un abogado cambiando un query
 * param se leería las notas internas de la clínica.
 *
 * Acá no hay a dónde cambiar: el Admin es un solo portal y todo el que llega
 * hasta esta ruta ya pasó el middleware, que manda a DOCTOR, PROVIDER y LAWYER
 * a otro lado antes de llegar. Así que el parámetro ni se lee: se fija en
 * `admin` y no hay superficie que discutir.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@precision-medical/auth/server';
import { getChangelog } from '@precision-medical/database/release-notes';

export const dynamic = 'force-dynamic';

const APP = 'web';
const AUDIENCIA = 'admin' as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const since = req.nextUrl.searchParams.get('since');
  const bootAt = req.nextUrl.searchParams.get('bootAt') ?? undefined;

  if (since === null) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  // Mismo origen que el resto de la UI: la cookie del switcher de idioma.
  const locale = (await cookies()).get('locale')?.value === 'es' ? 'es' : 'en';

  const { modules, count } = await getChangelog({
    app: APP,
    since,
    bootAt,
    audience: AUDIENCIA,
    locale,
  });

  return NextResponse.json(
    { modules, count, audience: AUDIENCIA, locale },
    // Depende del usuario y del momento: nunca en CDN.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
