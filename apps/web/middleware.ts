import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { fetchDbUserAccess, isBlockedStatus } from '@precision-medical/auth/v2-apps';
import { dbRoleToRole } from './lib/permissions';
import { TIMECLOCK_URL, DOCTOR_PORTAL_URL } from './lib/app-urls';
import {
  ROLE_COOKIE, ROLE_EMAIL_COOKIE, ROLE_COOKIE_OPTIONS,
  STATUS_COOKIE, STATUS_EMAIL_COOKIE, STATUS_COOKIE_OPTIONS,
} from './lib/session-cookies';

function detectLocaleFromHeader(request: NextRequest): 'es' | 'en' {
  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, q] = lang.trim().split(';q=');
      return { code: (code ?? '').trim().toLowerCase(), q: q ? parseFloat(q) : 1.0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { code } of languages) {
    if (code.startsWith('es')) return 'es';
    if (code.startsWith('en')) return 'en';
  }
  return 'es';
}

/**
 * Módulos del Admin concedidos a mano, por persona.
 *
 * Viven en `users.clinicModules` con el prefijo `admin:` para no chocar con las
 * llaves de la clínica (`patients`, `settings:clinicas`, `doctor:calendar`…),
 * que están en el mismo JSON.
 *
 * Son OPT-IN: solo cuenta un `true` explícito. Al revés que los menús del
 * back-office, y a propósito — acá adentro está la caja chica de la empresa.
 */
const PREFIJO_DE_GRANT: Record<string, string> = {
  'admin:finanzas': '/dashboard/finanzas',
};

/**
 * Lo que un invitado necesita para que la app funcione, más allá de su módulo.
 *
 * `/api/trpc` está acá porque TODA la app pasa por ese único endpoint y no se
 * puede distinguir por ruta qué procedimiento se llama. **No es un agujero**:
 * cada procedimiento trae su propio guard, y el de Finanzas es
 * `finanzasProcedure`. Lo que protege el dato es ese, no esta lista.
 */
const RUTAS_SIEMPRE_ABIERTAS = ['/api/trpc', '/api/auth', '/no-access', '/login', '/_next'];

/** ¿Qué módulos del Admin le concedieron a esta persona? Edge-safe. */
async function getAdminGrants(email: string): Promise<string[]> {
  if (!email) return [];
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?select=clinicModules&email=ilike.${encodeURIComponent(email)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ clinicModules?: Record<string, boolean> | null }>;
    const mods = data[0]?.clinicModules ?? null;
    if (!mods) return [];
    return Object.keys(PREFIJO_DE_GRANT).filter((g) => mods[g] === true);
  } catch {
    // Ante un parpadeo de red NO se concede nada: el default es el de siempre.
    return [];
  }
}

/** Fetch role via Supabase REST API (no client library needed — edge-safe) */
async function getDbRole(email: string): Promise<string> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?select=role&email=eq.${encodeURIComponent(email)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    if (!res.ok) return 'EMPLOYEE';
    const data = await res.json() as Array<{ role: string }>;
    return data[0]?.role ?? 'EMPLOYEE';
  } catch {
    return 'EMPLOYEE';
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // ── Locale detection ────────────────────────────────────────────────────────
  let detectedLocale: 'es' | 'en' | null = null;
  if (!request.cookies.get('locale')) {
    detectedLocale = detectLocaleFromHeader(request);
    request.cookies.set('locale', detectedLocale);
  }

  // ── Session update ──────────────────────────────────────────────────────────
  const { response, user } = await updateSession(request);

  if (detectedLocale) {
    response.cookies.set('locale', detectedLocale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  }

  // ── Role-based routing ──────────────────────────────────────────────────────
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith('/dashboard');
  const isNoAccess = pathname === '/no-access';

  /**
   * Contraseña temporal: obligar el cambio antes de dejar entrar.
   *
   * La marca viaja en el JWT de la sesion (`user_metadata`), no en la DB ni en
   * una cookie. Dos motivos: se lee de la sesion que el middleware YA tiene, sin
   * pagar una consulta por request; y se limpia en la misma llamada con la que
   * la persona cambia la contraseña, asi que no hay ventana de cache que la deje
   * pegada y la mande a /reset-password en loop.
   *
   * Va ANTES del ruteo por rol a proposito: un EMPLOYEE seria desviado al Time
   * Clock y nunca llegaria a la pantalla donde cambiarla.
   */
  if (user && isDashboard && user.user_metadata?.must_change_password === true) {
    const url = request.nextUrl.clone();
    url.pathname = '/reset-password';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && isDashboard && !isNoAccess) {
    // Rol: cookie rápida primero, DB si no hay.
    // La cookie SOLO vale si pertenece al usuario actual — ver el porqué en
    // `lib/session-cookies.ts`. Cuando no le pertenece se ignora y se vuelve a
    // consultar, así que el usuario nuevo nunca hereda el rol del anterior.
    const cookieOwner = request.cookies.get(ROLE_EMAIL_COOKIE)?.value;
    const cookieFresh = !!user.email && cookieOwner === user.email;

    let dbRoleStr = cookieFresh ? request.cookies.get(ROLE_COOKIE)?.value : undefined;

    if (!dbRoleStr && user.email) {
      dbRoleStr = await getDbRole(user.email);
      response.cookies.set(ROLE_COOKIE, dbRoleStr, ROLE_COOKIE_OPTIONS);
      response.cookies.set(ROLE_EMAIL_COOKIE, user.email, ROLE_COOKIE_OPTIONS);
    }

    /**
     * Puerta por ESTADO de la cuenta.
     *
     * Hasta el 2026-08-31 ninguna app miraba `users.status`: el único freno era
     * el ban de Supabase Auth que pone `syncAuthStatus`, así que marcar a
     * alguien INACTIVE por SQL —sin pasar por la pantalla de Usuarios— no
     * cerraba nada. La lista mostraba un estado que no gobernaba el acceso.
     *
     * Cookie propia y CORTA (60s) en vez de meterlo en la de rol, que dura una
     * hora: una suspensión que tarda una hora en aplicar no es una suspensión.
     * El costo es una consulta por minuto y por usuario activo, y solo cuando la
     * cookie venció.
     */
    if (user.email) {
      const statusOwner = request.cookies.get(STATUS_EMAIL_COOKIE)?.value;
      let status = statusOwner === user.email
        ? request.cookies.get(STATUS_COOKIE)?.value
        : undefined;

      if (!status) {
        status = (await fetchDbUserAccess(user.email)).status ?? '';
        response.cookies.set(STATUS_COOKIE, status, STATUS_COOKIE_OPTIONS);
        response.cookies.set(STATUS_EMAIL_COOKIE, user.email, STATUS_COOKIE_OPTIONS);
      }

      if (isBlockedStatus(status)) {
        const url = request.nextUrl.clone();
        url.pathname = '/no-access';
        url.search = `?reason=${status.toLowerCase()}`;
        return NextResponse.redirect(url);
      }
    }

    const role = dbRoleToRole(dbRoleStr ?? 'EMPLOYEE');

    /**
     * Employee → PM Time Clock, SALVO que tenga un módulo concedido a mano.
     *
     * ── Por qué hay una excepción ──────────────────────────────────────────
     *
     * Erick necesita darle Finanzas a una persona concreta (Darrell, EMPLOYEE)
     * sin darle el rol de admin ni abrírselo a los otros 16 empleados. La
     * matriz de `lib/permissions.ts` es por ROL y no tiene forma de decir
     * "esta persona sí"; la casilla vive en `users.clinicModules`, el mismo
     * JSON que ya reparte los menús de la clínica.
     *
     * ── Y por qué entra ACOTADO, no a todo el Admin ────────────────────────
     *
     * Porque **4 de las 27 páginas del Admin chequean permiso**; las otras 23
     * confían en que esta puerta está cerrada. Dejarlo pasar sin más le daría
     * Usuarios, Wallets, Pagos y FX escribiendo la URL a mano.
     *
     * Así que se reusa el molde que ya usa el Contador unas líneas más abajo:
     * entra, pero solo a los prefijos que le concedieron. Fuera de ahí, se lo
     * devuelve a su módulo en vez de rebotarlo al Time Clock — rebotarlo fuera
     * del Admin desde una URL interna se lee como que se cerró la sesión.
     *
     * La otra mitad del permiso vive en `finanzasProcedure` (packages/api): sin
     * eso la pantalla abriría vacía, porque `pettyCash` era `adminProcedure`.
     */
    if (role === 'employee') {
      const concedidos = await getAdminGrants(user.email ?? '');
      if (concedidos.length === 0) {
        return NextResponse.redirect(TIMECLOCK_URL);
      }
      const permitido =
        RUTAS_SIEMPRE_ABIERTAS.some((p) => pathname.startsWith(p)) ||
        concedidos.some((g) => {
          const prefijo = PREFIJO_DE_GRANT[g];
          return prefijo !== undefined && pathname.startsWith(prefijo);
        });
      if (!permitido) {
        const url = request.nextUrl.clone();
        url.pathname = PREFIJO_DE_GRANT[concedidos[0]!] ?? '/dashboard';
        url.search = '';
        return pathname === url.pathname ? response : NextResponse.redirect(url);
      }
      return response;
    }

    // ── Roles que NO trabajan en el Admin ──────────────────────────────────
    // Hasta acá nada los frenaba: el layout no bloquea (solo esconde items del
    // menú) y casi ninguna pagina chequea permiso, así que llegaban al dashboard
    // y —peor— los datos cargaban, porque medio router estaba en
    // `protectedProcedure`. Cerrar la puerta apaga esa superficie entera de una,
    // en vez de blindar endpoint por endpoint.
    //
    // Se puede cerrar sin romper nada porque el acceso que la matriz de
    // lib/permissions les promete (`metricas: own_data` / `own_cases`) NUNCA se
    // implementó: en metricas no hay filtrado por usuario. No hay pantalla suya
    // que dependa de esto.
    //
    // AUDITOR_AI queda AFUERA de este bloqueo a propósito: es el único con una
    // pantalla real y bien gateada acá (`ai-agents` sí chequea permiso).
    if (role === 'doctor' || role === 'provider') {
      return NextResponse.redirect(DOCTOR_PORTAL_URL);
    }

    if (role === 'lawyer') {
      const url = request.nextUrl.clone();
      url.pathname = '/no-access';
      url.search = '';
      return NextResponse.redirect(url);
    }

    // Contador → only /dashboard/employees/* allowed
    if (role === 'contador' && !pathname.startsWith('/dashboard/employees')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/employees';
      url.search = '?tab=asistencia';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Excludes (in order):
    // - _next/static, _next/image, favicon.ico — Next.js internals
    // - api/auth — Supabase auth callbacks (mustn't be wrapped)
    // - manifest.json, sw.js, workbox-*.js — PWA files served as
    //   pure static. The middleware previously ran on these and
    //   added Set-Cookie headers which made Chrome's installability
    //   checker reject the manifest ("no manifest detected") even
    //   though the file existed.
    // - image extensions — static assets
    '/((?!_next/static|_next/image|favicon\\.ico|api/auth|manifest\\.json|sw\\.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
