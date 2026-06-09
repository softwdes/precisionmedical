import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { canAccessV2App, fetchDbRole } from '@precision-medical/auth/v2-apps';

/**
 * Back-Office middleware.
 *
 * Roles permitidos: SUPER_ADMIN · ADMIN · CONTADOR
 *
 * Flujo:
 *   1. Rutas públicas (/login, /api/auth/*) → pass-through
 *   2. updateSession() → refresca cookies de Supabase
 *   3. Sin usuario → redirect /login?redirectTo=<pathname>
 *   4. Rol sin acceso → redirect /no-access
 *   5. Todo OK → continúa
 */

const ROLE_COOKIE = 'pm_role';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Rutas públicas — pasar sin verificar
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/no-access') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth');

  if (isPublic) return NextResponse.next();

  // Refrescar sesión Supabase (maneja cookies SSR)
  const { response, user } = await updateSession(request);

  // No autenticado → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Obtener rol (cookie rápida primero, DB lento si no hay)
  let dbRole = request.cookies.get(ROLE_COOKIE)?.value;

  if (!dbRole && user.email) {
    dbRole = await fetchDbRole(user.email);
    response.cookies.set(ROLE_COOKIE, dbRole, {
      httpOnly: true,
      path:     '/',
      maxAge:   3600,    // 1 hora
      sameSite: 'lax',
    });
  }

  // Verificar acceso a back-office
  if (!canAccessV2App(dbRole ?? '', 'back-office')) {
    const url = request.nextUrl.clone();
    url.pathname = '/no-access';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
