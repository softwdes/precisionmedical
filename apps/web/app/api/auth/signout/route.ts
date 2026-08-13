import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { ROLE_COOKIE, ROLE_EMAIL_COOKIE } from '@/lib/session-cookies';

/**
 * GET /api/auth/signout
 *
 * Cierra la sesión de Supabase, **borra las cookies propias** y manda al login.
 *
 * El borrado es la parte que faltaba: el rol se cachea 1h en `pm_role` y no se
 * limpiaba en ningún lado. Cerrar sesión y volver a entrar —lo primero que uno
 * hace cuando le cambian el rol— seguía leyendo el rol viejo hasta que la cookie
 * expirara sola, y encima el siguiente usuario del mismo navegador arrancaba con
 * el rol del anterior. Son `httpOnly`, así que solo el servidor puede borrarlas:
 * cualquier logout que no pase por acá las deja vivas.
 *
 * `?expired=true` lo usa el guard de sesión de 12h para que el login explique
 * por qué lo sacaron, en vez de aparecer sin motivo.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);

  const supabase = await createServerClient();
  await supabase.auth.signOut();

  const loginUrl = new URL('/login', origin);
  if (searchParams.get('expired') === 'true') loginUrl.searchParams.set('expired', 'true');

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ROLE_COOKIE);
  response.cookies.delete(ROLE_EMAIL_COOKIE);
  return response;
}
