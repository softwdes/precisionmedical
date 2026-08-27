import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { dbRoleToRole } from './lib/permissions';
import { TIMECLOCK_URL, DOCTOR_PORTAL_URL } from './lib/app-urls';
import { ROLE_COOKIE, ROLE_EMAIL_COOKIE, ROLE_COOKIE_OPTIONS } from './lib/session-cookies';

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

    const role = dbRoleToRole(dbRoleStr ?? 'EMPLOYEE');

    // Employee → redirect to PM Time Clock immediately
    if (role === 'employee') {
      return NextResponse.redirect(TIMECLOCK_URL);
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
