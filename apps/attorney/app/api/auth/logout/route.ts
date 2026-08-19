import { createServerClient } from '@precision-medical/auth/server';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/logout
 *
 * Cierra la sesión de Supabase, borra las cookies propias y manda al login.
 *
 * El portal no tenía ninguna salida por servidor: el único `signOut()` vivía en
 * la página de "sin acceso" y corría en el navegador. Como `pm_role` es
 * httpOnly, desde ahí no hay forma de borrarla — la sesión moría pero el rol
 * cacheado quedaba vivo hasta una hora. Espejo de la de Clinical.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const reason = searchParams.get('reason') ?? 'manual';

  const supabase = await createServerClient();
  await supabase.auth.signOut();

  const loginUrl = new URL('/login', origin);
  if (reason !== 'manual') loginUrl.searchParams.set('reason', reason);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete('pm_role');
  response.cookies.delete('pm_role_email');

  return response;
}
