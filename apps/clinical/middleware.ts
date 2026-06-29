import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { canAccessV2App, fetchDbRole } from '@precision-medical/auth/v2-apps';

/**
 * Clinical middleware.
 *
 * Roles permitidos: SUPER_ADMIN · ADMIN · PROVIDER · EMPLOYEE
 */

const ROLE_COOKIE        = 'pm_role';
const LAST_ACTIVE_COOKIE = 'pm_last_active';
const INACTIVITY_HOURS   = 4;

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

  // ── Inactivity / browser-close check ────────────────────────────────────────
  const lastActiveRaw = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;

  if (!lastActiveRaw) {
    // pm_last_active is a session cookie — if missing, browser was closed.
    // Allow through only if the Supabase sign-in is recent (< INACTIVITY_HOURS).
    const lastSignIn  = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    const hoursSince  = (Date.now() - lastSignIn) / (1000 * 60 * 60);
    if (hoursSince > INACTIVITY_HOURS) {
      const url = request.nextUrl.clone();
      url.pathname = '/api/auth/logout';
      url.searchParams.set('reason', 'session_expired');
      return NextResponse.redirect(url);
    }
  } else {
    const hoursSince = (Date.now() - parseInt(lastActiveRaw, 10)) / (1000 * 60 * 60);
    if (hoursSince > INACTIVITY_HOURS) {
      const url = request.nextUrl.clone();
      url.pathname = '/api/auth/logout';
      url.searchParams.set('reason', 'session_expired');
      return NextResponse.redirect(url);
    }
  }

  // Refresh session cookie on every authenticated request (session cookie = no maxAge)
  response.cookies.set(LAST_ACTIVE_COOKIE, Date.now().toString(), {
    httpOnly: true,
    path:     '/',
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  });
  // ────────────────────────────────────────────────────────────────────────────

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
