import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { fetchDbUserAccess, fetchRoleClinicAccess, fetchUserClinicModules, isBlockedStatus } from '@precision-medical/auth/v2-apps';
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
const STATUS_COOKIE      = 'pm_status'; // users.status cacheado junto al rol
const MODULES_COOKIE     = 'pm_mods'; // JSON de pm_clinic_modules ('*' = sin restricción)
const LAST_ACTIVE_COOKIE = 'pm_last_active';
const INACTIVITY_HOURS   = 4;

/**
 * Cuanto viven las cookies de permisos (rol, acceso y modulos).
 *
 * Era 1 hora y eso producia un sintoma que parecia un bug de permisos: al darle
 * un modulo a alguien, **el menu lo mostraba pero el clic no entraba**. El menu
 * lo pinta `(admin)/layout.tsx`, que consulta la DB en cada carga, mientras que
 * el portero de este archivo lee la cookie cacheada. Durante una hora las dos
 * mitades del sistema decian cosas distintas, y el usuario veia una opcion
 * muerta (reportado con Wilfredo, 25-ago).
 *
 * 60s deja la ventana en algo que nadie alcanza a notar. El costo es una
 * consulta por minuto y por usuario activo, y solo cuando la cookie vencio —no
 * por request—, asi que el ahorro que motivo el cache se conserva casi entero.
 */
const PERMS_CACHE_SECONDS = 60;

// Mapa ruta → módulo del back-office (checks por rol en roles_config)
const MODULE_ROUTES: Array<[module: string, pattern: RegExp]> = [
  ['dashboard', /^\/dashboard/],
  ['patients',  /^\/(patients|front-office)/], // detalle de caso cuenta como Patients
  ['calendar',  /^\/calendar/],
  ['admission', /^\/admission/],
  ['externals', /^\/admin\/lawyers/],
  // `/intake` se gobierna con el modulo de Edson: su menú se retiró pero las
  // rutas siguen existiendo, y sacarlas de esta lista las dejaria sin gobierno
  // (visibles para cualquiera con un modulo cualquiera).
  ['edson',     /^\/(edson|intake)/],
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
 *  · `templates`, `diagnoses`, `catalog`, `lab-*` → los usa el portal médico.
 *  · `patients/*`, `cases/*` → NO son "datos del módulo Patients": son la ficha
 *    compartida de la clínica. `patients/search` lo llama el diálogo de cita
 *    (Calendar), `patients/autocomplete` el alta de caso y el compositor de
 *    mensajes, y `cases/[id]/*` lo abre el modal de caso desde Calendar,
 *    Admisión, Edson y Facturación. Cerrarlos por módulo rompería cuatro
 *    pantallas para tapar un dato que esas mismas pantallas ya muestran.
 *    Lo que sí se cerró es el hueco real que tenían: `patients/list` recortaba
 *    por un `providerId` que mandaba el cliente. Eso se arregló en la ruta,
 *    resolviéndolo contra la sesión — no acá.
 */
type ApiGuard = [module: string, pattern: RegExp, scope: 'all' | 'write'];

const MODULE_API_ROUTES: ApiGuard[] = [
  ['billing',   /^\/api\/admin\/billing(\/|$)/,    'all'],
  ['settings',  /^\/api\/admin\/audit-logs(\/|$)/, 'all'],
  ['settings',  /^\/api\/admin\/(specialties|services|service-codes|insurances|clinics|employees)(\/|$)/, 'write'],
  ['externals', /^\/api\/admin\/lawyers(\/|$)/,    'write'],
  // Datos de Edson: los consumen `/edson` y `/intake`, y nada más. El menú de
  // `/intake` se retiró pero sus rutas siguen vivas — mismo criterio que
  // MODULE_ROUTES, donde ese par también viaja junto.
  ['edson',     /^\/api\/admin\/(edson|intake)(\/|$)/, 'all'],
  // Comunicaciones: el historial de llamadas y el de SMS solo se abren desde la
  // lista de Patients (`CallHistoryDialog` / `SmsHistoryDialog`). Son el registro
  // de con quién se habló y qué se le mandó — no es un lookup compartido.
  ['patients',  /^\/api\/admin\/(call-logs|message-logs)(\/|$)/, 'all'],
  // Solo la COLECCIÓN (la agenda del día de Admisión). Los subrecursos quedan
  // fuera a propósito: `[id]/check-in` lo llama el panel de cita del Calendario
  // y `[id]/admit` / `[id]/triage` el portal médico y la consulta.
  ['admission', /^\/api\/admin\/admission$/, 'all'],
];

/**
 * Módulos cuya API SÍ consume el portal médico.
 *
 * El portal reúsa pantallas administrativas enteras —`/doctor/patients` monta
 * la misma lista que `/patients`, historiales de llamada y SMS incluidos (ver
 * el comentario de esos botones en `patients-client.tsx`)—, así que la regla
 * "un doctor no tiene ningún módulo administrativo" deja de ser cierta apenas
 * se cierra un módulo que esas pantallas compartidas consultan.
 *
 * Sin esta lista, agregar `patients` a MODULE_API_ROUTES apagaba el historial
 * de llamadas del portal médico con un 403 — un módulo que el doctor no tiene
 * porque no le corresponde tenerlo, no porque se le haya negado.
 */
const DOCTOR_PORTAL_MODULES = new Set(['patients']);

/**
 * Webhooks de Twilio — las ÚNICAS rutas de `/api/twilio/*` que son públicas.
 *
 * Se listan una por una y no por prefijo, que es como estaban. El prefijo
 * `/api/twilio` cubría también cinco rutas que llama el NAVEGADOR con sesión
 * —`token`, `presence`, `claim-call`, `incoming-context` y `link-call`—, y las
 * dejaba abiertas de par en par. Cuatro se salvaban porque revisan la sesión
 * por dentro; `link-call` no revisaba nada, y es una escritura: reasigna el
 * paciente y el caso de un `CallLog` a partir de un `CallSid`.
 *
 * Estas cuatro sí son de Twilio, que no manda cookie. Se autentican con la
 * firma `x-twilio-signature` dentro de cada handler (ver `readTwilioWebhook`
 * en `lib/twilio-server.ts`).
 */
const TWILIO_WEBHOOKS = new Set([
  '/api/twilio/voice',
  '/api/twilio/incoming',
  '/api/twilio/call-status',
  '/api/twilio/sms-status',
]);

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
  billing: '/billing', settings: '/settings',
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
    TWILIO_WEBHOOKS.has(pathname) ||
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

  let dbRole   = cookieFresh ? request.cookies.get(ROLE_COOKIE)?.value   : undefined;
  let dbStatus = cookieFresh ? request.cookies.get(STATUS_COOKIE)?.value : undefined;

  if ((!dbRole || dbStatus === undefined) && user.email) {
    // Rol y estado salen de la MISMA consulta: son la misma fila.
    const acceso = await fetchDbUserAccess(user.email);
    dbRole   = acceso.role;
    dbStatus = acceso.status ?? '';
    const cookieOpts = { httpOnly: true, path: '/', maxAge: PERMS_CACHE_SECONDS, sameSite: 'lax' as const };
    response.cookies.set(ROLE_COOKIE, dbRole, cookieOpts);
    response.cookies.set(STATUS_COOKIE, dbStatus, cookieOpts);
    response.cookies.set(ROLE_EMAIL_COOKIE, user.email, cookieOpts);
  }

  /**
   * Puerta por ESTADO de la cuenta.
   *
   * Va acá, antes de cualquier check por rol o por módulo: una cuenta cortada no
   * tiene que discutirse menú por menú. Hasta el 2026-08-31 el estado no se
   * miraba en ninguna app y el único freno era el ban de Supabase Auth que pone
   * `syncAuthStatus`; marcar a alguien INACTIVE por SQL no cerraba nada.
   *
   * `PENDING_VERIFICATION` NO bloquea: significa "todavía no puso su propia
   * contraseña", que es el estado normal de quien recibió una clave temporal.
   */
  if (isBlockedStatus(dbStatus)) {
    const url = request.nextUrl.clone();
    url.pathname = '/no-access';
    url.search = `?reason=${dbStatus!.toLowerCase()}`;
    return NextResponse.redirect(url);
  }

  // ── Portal médico (/doctor) — scoping por rol y por host ───────────────────
  //
  // `/doctor-print/*` (nota clínica y orden de laboratorio imprimibles) NO es
  // área del portal, aunque el nombre lo sugiera: se abre también desde el
  // detalle del caso, que es una pantalla administrativa. Exigirle la capacidad
  // "ver como doctor" mandaba al dashboard —en una pestaña nueva— a cualquiera
  // del staff que no la tuviera, después de haberle mostrado el botón.
  //
  // Imprime cualquiera que ya tenga acceso a la clínica (decisión de Erick
  // 2026-08-20): si la pantalla te deja LEER la nota, dejarte imprimirla no
  // agrega alcance. Quien no debe ver la de otro es el doctor común, y eso lo
  // resuelve la página con `canViewAsDoctor` — no el ruteo.
  const isDoctorPrint = pathname.startsWith('/doctor-print/');
  const isDoctorArea =
    pathname === '/doctor' ||
    pathname.startsWith('/doctor/') ||
    isDoctorPrint;
  // providers.lienmaster.net (prod) / providers.localhost (dev) → solo mundo doctor
  const isProvidersHost = /^providers?\./.test(request.headers.get('host') ?? '');
  const isApi       = pathname.startsWith('/api/');
  const isAdminRole = dbRole === 'SUPER_ADMIN' || dbRole === 'ADMIN';

  // ── Portal legal (/attorney) — scoping por rol y por host ─────────────────
  // Mismo patrón que el portal médico de abajo. attorney.lienmaster.net (prod) /
  // attorney.localhost (dev) → solo mundo abogado.
  const isAttorneyArea = pathname === '/attorney' || pathname.startsWith('/attorney/');
  const isAttorneyHost = /^attorney\./.test(request.headers.get('host') ?? '');

  if (dbRole === 'LAWYER') {
    // El abogado vive en /attorney/*. Cualquier otra página lo devuelve ahí —
    // nunca al back-office, que no es suyo.
    if (!isAttorneyArea && !isApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/attorney';
      url.search = '';
      return NextResponse.redirect(url);
    }
    // Las APIs pasan porque las vistas del portal consumen /api/attorney/*, que
    // filtra por sesión. NO se le abre /api/admin/*: ahí las consultas asumen
    // admin y devolverían la clínica entera.
    //
    // `/api/changelog/*` es la excepción: son las notas de release, que por
    // diseño sirven a las tres audiencias desde la misma ruta y resuelven CUÁL
    // con `resolverAudiencia()`, contra la sesión — a un LAWYER le devuelve
    // `attorney` y nada más, pida lo que pida. Sin esto el portal legal recibía
    // 403 y su modal de novedades no cargó nunca: el banner decía "Actualizar",
    // el usuario recargaba y no veía qué había cambiado.
    if (isApi && !pathname.startsWith('/api/attorney/') && !pathname.startsWith('/api/changelog')) {
      return forbidden('attorney', response);
    }
    return response;
  }

  // Por attorney.* solo entra el abogado (ya devuelto arriba) o un admin, que lo
  // usa para soporte y demos eligiendo un bufete. El resto del staff recibe
  // "sin acceso" explícito en el mismo dominio, igual que en providers.*.
  if (isAttorneyHost) {
    if (!isAdminRole) {
      const url = request.nextUrl.clone();
      url.pathname = '/no-access';
      url.search = '?portal=attorney';
      return pathname === '/no-access' ? response : NextResponse.redirect(url);
    }
    if (!isAttorneyArea && !isApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/attorney';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (dbRole === 'DOCTOR' || dbRole === 'PROVIDER') {
    // Los doctores viven en /doctor/* — cualquier página administrativa redirige
    // a su portal. Las APIs pasan, porque las vistas compartidas del portal
    // consumen /api/admin/* — salvo las gobernadas por un módulo administrativo
    // que ninguna pantalla suya llame (ver DOCTOR_PORTAL_MODULES).
    if (!isDoctorArea && !isApi) {
      const url = request.nextUrl.clone();
      url.pathname = '/doctor';
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (isApi) {
      const guarded = apiGuardModule(pathname, request.method);
      if (guarded && !DOCTOR_PORTAL_MODULES.has(guarded)) return forbidden(guarded, response);
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
        httpOnly: true, path: '/', maxAge: PERMS_CACHE_SECONDS, sameSite: 'lax',
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

  // Staff sin la capacidad no navega el portal médico — pero sí imprime.
  if (isDoctorArea && !isDoctorPrint && !canViewAsDoctor) {
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
      maxAge:   PERMS_CACHE_SECONDS,
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
