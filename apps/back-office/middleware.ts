import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { fetchDbRole, fetchRoleClinicAccess, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';

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
const ROLE_EMAIL_COOKIE  = 'pm_role_email'; // a quién pertenece pm_role/pm_clinic/pm_mods
const CLINIC_COOKIE      = 'pm_clinic';
const MODULES_COOKIE     = 'pm_mods'; // JSON de pm_clinic_modules ('*' = sin restricción)
const LAST_ACTIVE_COOKIE = 'pm_last_active';
const INACTIVITY_HOURS   = 4;

// Mapa ruta → módulo del back-office (checks por rol en roles_config)
const MODULE_ROUTES: Array<[module: string, pattern: RegExp]> = [
  ['dashboard', /^\/dashboard/],
  ['patients',  /^\/(patients|front-office)/], // detalle de caso cuenta como Patients
  ['calendar',  /^\/calendar/],
  ['admission', /^\/admission/],
  ['externals', /^\/admin\/lawyers/],
  ['edson',     /^\/edson/],
  ['intake',    /^\/intake/],
  ['billing',   /^\/billing/],
  ['settings',  /^\/(settings|audit-logs|admin\/(specialties|insurances|services|diagnoses|providers|templates))/],
];

// Ruta home de cada módulo (para redirigir al primero permitido)
const MODULE_HOME: Record<string, string> = {
  dashboard: '/dashboard', patients: '/patients', calendar: '/calendar',
  admission: '/admission', externals: '/admin/lawyers', edson: '/edson',
  intake: '/intake', billing: '/billing', settings: '/settings',
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Rutas públicas — pasar sin verificar
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/no-access') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/twilio');

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

  // Obtener rol (cookie rápida primero, DB lento si no hay).
  // La cookie solo es válida si pertenece al usuario actual — sin esto, un login
  // con otra cuenta en el mismo navegador hereda el rol cacheado del usuario anterior.
  const cookieOwner = request.cookies.get(ROLE_EMAIL_COOKIE)?.value;
  const cookieFresh = !!user.email && cookieOwner === user.email;

  let dbRole = cookieFresh ? request.cookies.get(ROLE_COOKIE)?.value : undefined;

  if (!dbRole && user.email) {
    dbRole = await fetchDbRole(user.email);
    const cookieOpts = { httpOnly: true, path: '/', maxAge: 3600, sameSite: 'lax' as const };
    response.cookies.set(ROLE_COOKIE, dbRole, cookieOpts);
    response.cookies.set(ROLE_EMAIL_COOKIE, user.email, cookieOpts);
  }

  // ── Portal médico (/doctor) — scoping por rol ──────────────────────────────
  const isDoctorArea = pathname === '/doctor' || pathname.startsWith('/doctor/');

  if (dbRole === 'DOCTOR' || dbRole === 'PROVIDER') {
    // Los doctores viven en /doctor/* — cualquier página administrativa redirige
    // a su portal. Las APIs pasan (las vistas compartidas consumen /api/admin/*).
    if (!isDoctorArea && !pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone();
      url.pathname = '/doctor';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return response; // PROVIDER no pasa por el check pm_clinic del back-office
  }

  // Staff no navega el portal médico (SUPER_ADMIN/ADMIN sí, para soporte)
  if (isDoctorArea && dbRole !== 'SUPER_ADMIN' && dbRole !== 'ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Verificar acceso al back-office.
  // Primero revisa cookie cacheada (1h); si no hay, consulta roles_config en DB.
  // fetchRoleClinicAccess devuelve true para SUPER_ADMIN/ADMIN/CONTADOR directamente,
  // y para otros roles consulta pm_clinic en roles_config (ej: EMPLOYEE con toggle ON).
  let clinicAccess = cookieFresh ? request.cookies.get(CLINIC_COOKIE)?.value : undefined;

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

  // ── Checks por menú POR USUARIO (users.clinicModules) ─────────────────────
  // null = "Visión completa"; con mapa, solo ve/entra a los módulos marcados.
  // SUPER_ADMIN y ADMIN nunca se restringen.
  if (dbRole && dbRole !== 'SUPER_ADMIN' && dbRole !== 'ADMIN' && !pathname.startsWith('/api/')) {
    let modsRaw = cookieFresh ? request.cookies.get(MODULES_COOKIE)?.value : undefined;

    if (modsRaw === undefined && user.email) {
      const mods = await fetchUserClinicModules(user.email);
      modsRaw = mods ? JSON.stringify(mods) : '*';
      response.cookies.set(MODULES_COOKIE, modsRaw, {
        httpOnly: true, path: '/', maxAge: 3600, sameSite: 'lax',
      });
    }

    if (modsRaw && modsRaw !== '*') {
      let mods: Record<string, boolean> = {};
      try { mods = JSON.parse(modsRaw) as Record<string, boolean>; } catch { /* '*' fallback */ }

      const matched = MODULE_ROUTES.find(([, re]) => re.test(pathname));
      const blocked = matched ? mods[matched[0]] === false : false;
      const isRoot  = pathname === '/';

      if (blocked || isRoot) {
        const firstAllowed = MODULE_ROUTES.find(([m]) => mods[m] !== false)?.[0];
        const url = request.nextUrl.clone();
        url.pathname = firstAllowed ? MODULE_HOME[firstAllowed]! : '/no-access';
        url.search = '';
        if (url.pathname !== pathname) return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|workbox-.*\\.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
