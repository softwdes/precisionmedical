import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { fetchDbRole, fetchRoleClinicAccess, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { DOCTOR_VIEW_MODULE } from '@/lib/doctor-view-module';

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

/**
 * Rutas de API gobernadas por módulo.
 *
 * El check por menú solo cubría páginas, así que quien tenía un módulo apagado
 * igual podía llamar su API con un `fetch`. Esto cierra esa puerta, pero NO se
 * puede hacer por prefijo a ciegas: varios endpoints de `/api/admin/*` los
 * consumen pantallas de OTRO módulo y el portal médico.
 *
 * De ahí los dos alcances:
 *  · `all`   — datos del módulo sin callers fuera de él. Se cierra entero.
 *  · `write` — el GET es un lookup compartido (autocompletes de abogado y
 *              aseguradora en alta de caso, clínicas en Day Admission), así que
 *              solo se bloquean POST/PATCH/PUT/DELETE.
 *
 * Deliberadamente FUERA de la lista, porque romperían pantallas de otro módulo:
 *  · `cash-services` → lo consumen `visit-summary` y `appointment-detail-panel`,
 *    que son las vistas de la consulta del doctor.
 *  · `call-logs`     → lo consume la pantalla de Patients, no Externals.
 *  · `templates`, `diagnoses`, `catalog`, `lab-*` → los usa el portal médico.
 */
type ApiGuard = [module: string, pattern: RegExp, scope: 'all' | 'write'];

const MODULE_API_ROUTES: ApiGuard[] = [
  ['billing',   /^\/api\/admin\/billing(\/|$)/,    'all'],
  ['settings',  /^\/api\/admin\/audit-logs(\/|$)/, 'all'],
  ['settings',  /^\/api\/admin\/(specialties|services|service-codes|insurances|clinics|employees)(\/|$)/, 'write'],
  ['externals', /^\/api\/admin\/lawyers(\/|$)/,    'write'],
];

/** Módulo que gobierna esta request de API, o null si no está gobernada. */
function apiGuardModule(pathname: string, method: string): string | null {
  const isWrite = method !== 'GET' && method !== 'HEAD';
  for (const [module, pattern, scope] of MODULE_API_ROUTES) {
    if (pattern.test(pathname) && (scope === 'all' || isWrite)) return module;
  }
  return null;
}

/**
 * 403 para una API bloqueada. Arrastra las cookies que `updateSession` acaba de
 * refrescar: devolver una respuesta nueva y pelada descartaría ese refresh.
 */
function forbidden(module: string, base: NextResponse): NextResponse {
  const res = NextResponse.json({ error: 'FORBIDDEN', module }, { status: 403 });
  for (const cookie of base.cookies.getAll()) res.cookies.set(cookie);
  return res;
}

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
    pathname.startsWith('/api/twilio') ||
    pathname.startsWith('/api/scriptsure/webhook'); // DAW → nosotros, Basic Auth propio

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

  // ── Portal médico (/doctor) — scoping por rol y por host ───────────────────
  // /doctor-print/* son documentos imprimibles del portal (sin shell) — mismo scoping
  const isDoctorArea =
    pathname === '/doctor' ||
    pathname.startsWith('/doctor/') ||
    pathname.startsWith('/doctor-print/');
  // providers.lienmaster.net (prod) / providers.localhost (dev) → solo mundo doctor
  const isProvidersHost = /^providers?\./.test(request.headers.get('host') ?? '');
  const isApi       = pathname.startsWith('/api/');
  const isAdminRole = dbRole === 'SUPER_ADMIN' || dbRole === 'ADMIN';

  if (dbRole === 'DOCTOR' || dbRole === 'PROVIDER') {
    // Los doctores viven en /doctor/* — cualquier página administrativa redirige
    // a su portal. Las APIs pasan, porque las vistas compartidas del portal
    // consumen /api/admin/* — salvo las gobernadas por un módulo administrativo,
    // que un doctor no tiene ninguno: no hay pantalla suya que las llame.
    if (!isDoctorArea && !isApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/doctor';
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (isApi) {
      const guarded = apiGuardModule(pathname, request.method);
      if (guarded) return forbidden(guarded, response);
    }
    return response; // PROVIDER no pasa por el check pm_clinic del back-office
  }

  // ── Módulos POR USUARIO (users.clinicModules) ──────────────────────────────
  // Se resuelve acá arriba porque de este mismo mapa sale la capacidad de entrar
  // al portal médico. null = "Visión completa"; SUPER_ADMIN/ADMIN nunca se
  // restringen. Se consulta también en /api/*: la cookie es compartida, así que
  // el fetch real ocurre una vez por hora y no una por request.
  let mods: Record<string, boolean> | null = null;

  if (dbRole && !isAdminRole) {
    let modsRaw = cookieFresh ? request.cookies.get(MODULES_COOKIE)?.value : undefined;

    if (modsRaw === undefined && user.email) {
      const fetched = await fetchUserClinicModules(user.email);
      modsRaw = fetched ? JSON.stringify(fetched) : '*';
      response.cookies.set(MODULES_COOKIE, modsRaw, {
        httpOnly: true, path: '/', maxAge: 3600, sameSite: 'lax',
      });
    }

    if (modsRaw && modsRaw !== '*') {
      try { mods = JSON.parse(modsRaw) as Record<string, boolean>; } catch { /* '*' fallback */ }
    }
  }

  // Capacidad "ver como doctor": los admins la tienen por rol; el resto la recibe
  // marcada en su ficha. Es OPT-IN — "visión completa" (mods null) NO la concede,
  // porque suplantar a un médico no puede caer de la regla "se ve salvo false".
  const canViewAsDoctor = isAdminRole || mods?.[DOCTOR_VIEW_MODULE] === true;

  // Por providers.* solo entra quien tiene el portal médico. El resto del staff
  // recibe "sin acceso" explícito en el mismo dominio — no se lo rebota en silencio.
  if (isProvidersHost) {
    if (!canViewAsDoctor) {
      const url = request.nextUrl.clone();
      url.pathname = '/no-access';
      url.search = '?portal=doctor';
      return pathname === '/no-access' ? response : NextResponse.redirect(url);
    }
    // Ya dentro de providers.* → directo al portal médico
    if (!isDoctorArea && !isApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/doctor';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Staff sin la capacidad no navega el portal médico
  if (isDoctorArea && !canViewAsDoctor) {
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

  // ── Checks por menú POR USUARIO ───────────────────────────────────────────
  // El mapa ya se resolvió arriba. Las páginas redirigen al primer módulo
  // permitido; las APIs gobernadas devuelven 403 (redirigir un fetch daría un
  // 200 con HTML y el cliente lo leería como éxito).
  const userModules = mods; // const: `let` pierde el narrowing dentro de los closures

  if (userModules && isApi) {
    const guarded = apiGuardModule(pathname, request.method);
    if (guarded && userModules[guarded] === false) return forbidden(guarded, response);
  }

  if (userModules && !isApi) {
    const matched = MODULE_ROUTES.find(([, re]) => re.test(pathname));
    const blocked = matched ? userModules[matched[0]] === false : false;
    const isRoot  = pathname === '/';

    if (blocked || isRoot) {
      const firstAllowed = MODULE_ROUTES.find(([m]) => userModules[m] !== false)?.[0];
      const url = request.nextUrl.clone();
      // Sin ningún menú del back-office pero con el portal médico (caso QA):
      // su home es /doctor, no un "sin acceso" que sería falso.
      url.pathname = firstAllowed
        ? MODULE_HOME[firstAllowed]!
        : (canViewAsDoctor ? '/doctor' : '/no-access');
      url.search = '';
      if (url.pathname !== pathname) return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|workbox-.*\\.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
