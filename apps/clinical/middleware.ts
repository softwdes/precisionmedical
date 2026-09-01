import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { canAccessV2App, fetchDbUserAccess, isBlockedStatus } from '@precision-medical/auth/v2-apps';

/**
 * Clinical middleware.
 *
 * Roles permitidos: SUPER_ADMIN · ADMIN · PROVIDER · EMPLOYEE
 */

const ROLE_COOKIE        = 'pm_role';
const STATUS_COOKIE        = 'pm_status';
/** El estado es la puerta: 60s, no la hora que dura el rol. Una suspension tiene que aplicar ya. */
const STATUS_CACHE_SECONDS = 60;
/**
 * A quien pertenece `pm_role`.
 *
 * El rol cacheado no se puede usar sin comprobar de quien es: sin esto, un
 * segundo login en el mismo navegador hereda el rol del usuario anterior por
 * hasta una hora, y como el rol decide a que app entra cada uno, eso puede meter
 * a alguien donde no le corresponde. Mismo patron que back-office y apps/web.
 */
const ROLE_EMAIL_COOKIE  = 'pm_role_email';
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

  // La cookie del rol SOLO vale si pertenece al usuario actual; si no, se ignora
  // y se vuelve a consultar.
  const cookieOwner = request.cookies.get(ROLE_EMAIL_COOKIE)?.value;
  const cookieFresh = !!user.email && cookieOwner === user.email;

  let dbRole   = cookieFresh ? request.cookies.get(ROLE_COOKIE)?.value   : undefined;
  let dbStatus = cookieFresh ? request.cookies.get(STATUS_COOKIE)?.value : undefined;

  if ((!dbRole || dbStatus === undefined) && user.email) {
    // Rol y estado salen de la MISMA consulta: son la misma fila.
    const acceso = await fetchDbUserAccess(user.email);
    dbRole   = acceso.role;
    dbStatus = acceso.status ?? '';
    const cookieOpts = { httpOnly: true, path: '/', maxAge: 3600, sameSite: 'lax' as const };
    response.cookies.set(ROLE_COOKIE, dbRole, cookieOpts);
    response.cookies.set(ROLE_EMAIL_COOKIE, user.email, cookieOpts);
    response.cookies.set(STATUS_COOKIE, dbStatus, { ...cookieOpts, maxAge: STATUS_CACHE_SECONDS });
  }

  /**
   * Puerta por ESTADO de la cuenta — antes de cualquier check por rol.
   *
   * Hasta el 2026-08-31 ninguna app miraba `users.status`: el unico freno era
   * el ban de Supabase Auth que pone `syncAuthStatus`, asi que marcar a alguien
   * INACTIVE por SQL —sin pasar por la pantalla de Usuarios— no cerraba nada.
   *
   * `PENDING_VERIFICATION` NO bloquea: significa "todavia no puso su propia
   * contrasena", que es el estado normal de quien recibio una clave temporal.
   */
  if (isBlockedStatus(dbStatus)) {
    const url = request.nextUrl.clone();
    url.pathname = '/no-access';
    url.search = `?reason=${dbStatus.toLowerCase()}`;
    return NextResponse.redirect(url);
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
