import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { fetchDbRole, fetchRoleClinicAccess } from '@precision-medical/auth/v2-apps';

/**
 * Back-Office middleware.
 *
 * Roles permitidos: SUPER_ADMIN · ADMIN · CONTADOR · cualquier rol con pm_clinic=true en roles_config
 *
 * Flujo:
 *   1. Rutas públicas (/login, /api/auth/*) → pass-through
 *   2. updateSession() → refresca cookies de Supabase
 *   3. Sin usuario → redirect /login?redirectTo=<pathname>
 *   4. Rol sin acceso → redirect /no-access
 *   5. Todo OK → continúa
 */

const ROLE_COOKIE        = 'pm_role';
const CLINIC_COOKIE      = 'pm_clinic';
const LAST_ACTIVE_COOKIE = 'pm_last_active';
const INACTIVITY_HOURS   = 4;

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

  // ── Inactivity / browser-close check ────────────────────────────────────────
  const lastActiveRaw = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;

  if (!lastActiveRaw) {
    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    const hoursSince = (Date.now() - lastSignIn) / (1000 * 60 * 60);
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

  response.cookies.set(LAST_ACTIVE_COOKIE, Date.now().toString(), {
    httpOnly: true,
    path:     '/',
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  });
  // ────────────────────────────────────────────────────────────────────────────

  // Obtener rol (cookie rápida primero, DB lento si no hay)
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

  // Verificar acceso al back-office.
  // Primero revisa cookie cacheada (1h); si no hay, consulta roles_config en DB.
  // fetchRoleClinicAccess devuelve true para SUPER_ADMIN/ADMIN/CONTADOR directamente,
  // y para otros roles consulta pm_clinic en roles_config (ej: EMPLOYEE con toggle ON).
  let clinicAccess = request.cookies.get(CLINIC_COOKIE)?.value;

  if (clinicAccess === undefined && dbRole) {
    const hasAccess = await fetchRoleClinicAccess(dbRole);
    clinicAccess = hasAccess ? '1' : '0';
    response.cookies.set(CLINIC_COOKIE, clinicAccess, {
      httpOnly: true,
      path:     '/',
      maxAge:   3600,
      sameSite: 'lax',
    });
  }

  if (clinicAccess !== '1') {
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
