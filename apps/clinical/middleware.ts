import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { canAccessV2App, fetchDbRole } from '@precision-medical/auth/v2-apps';

/**
 * Clinical middleware.
 *
 * Roles permitidos: SUPER_ADMIN · ADMIN · PROVIDER · EMPLOYEE
 */

const ROLE_COOKIE = 'pm_role';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/no-access') ||
    pathname.startsWith('/api/auth');

  if (isPublic) return NextResponse.next();

  const { response, user } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  let dbRole = request.cookies.get(ROLE_COOKIE)?.value;

  if (!dbRole && user.email) {
    dbRole = await fetchDbRole(user.email);
    response.cookies.set(ROLE_COOKIE, dbRole, {
      httpOnly: true,
      path:     '/',
      maxAge:   3600,
      sameSite: 'lax',
    });
  }

  if (!canAccessV2App(dbRole ?? '', 'clinical')) {
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
