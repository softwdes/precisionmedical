import { NextResponse } from 'next/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from '@/lib/session';

/**
 * Sólo ADMIN cura y publica notas de release.
 *
 * Guard explícito y no "estar logueado": es la lección de los 45 endpoints que
 * pedían sólo sesión. Publicar es lo que hace visible el texto para todo el
 * staff, así que no lo abre nadie más.
 */
const ALLOWED = new Set(['ADMIN', 'SUPER_ADMIN']);

export async function requireReleaseAdmin(): Promise<{ email: string } | NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  if (!ALLOWED.has(await fetchDbRole(user.email))) {
    return NextResponse.json({ error: 'FORBIDDEN_RELEASE_ADMIN' }, { status: 403 });
  }
  return { email: user.email };
}
