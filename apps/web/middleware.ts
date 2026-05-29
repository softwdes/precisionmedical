import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';
import { dbRoleToRole } from './lib/permissions';

const ROLE_COOKIE = 'pm_role';
const TIMECLOCK_URL = process.env.NEXT_PUBLIC_TIMECLOCK_URL ?? 'https://pmtc.lienmaster.net';

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

  if (user && isDashboard && !isNoAccess) {
    // Get role from cookie (fast path) or DB (slow path, then cache)
    let dbRoleStr = request.cookies.get(ROLE_COOKIE)?.value;

    if (!dbRoleStr && user.email) {
      dbRoleStr = await getDbRole(user.email);
      response.cookies.set(ROLE_COOKIE, dbRoleStr, {
        httpOnly: true,
        path: '/',
        maxAge: 3600,
        sameSite: 'lax',
      });
    }

    const role = dbRoleToRole(dbRoleStr ?? 'EMPLOYEE');

    // Employee → redirect to PM Time Clock immediately
    if (role === 'employee') {
      return NextResponse.redirect(TIMECLOCK_URL);
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
