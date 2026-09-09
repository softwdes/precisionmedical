import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { cuboDeRuta, registrarAuth, serverTiming, type MedicionAuth } from './auth-timing';

export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  /**
   * ── F0 · la medición ──────────────────────────────────────────────────────
   *
   * Esta es LA llamada que queremos sacar del camino caliente: `getUser()` no
   * decodifica el token, le pregunta al servidor de Auth por HTTP. Corre acá, o
   * sea en cada request de las cuatro apps, y otra vez por render de servidor.
   *
   * Se mide antes de cambiar nada para tener con qué comparar cuando entre
   * `getClaims()` (F2). Ver `auth-timing.ts` — no registra ni correo ni ruta.
   */
  const t0 = Date.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const medicion: MedicionAuth = {
    ms: Date.now() - t0,
    huboSesion: !!user,
    cubo: cuboDeRuta(pathname, request.headers),
  };
  registrarAuth(medicion);
  /**
   * El header va en TODAS las salidas, redirecciones incluidas: si solo lo
   * llevara la respuesta normal, justo los caminos con un salto de más —el del
   * login, que es el que estamos mirando— quedarían sin medir.
   */
  const conTiming = <T extends NextResponse>(res: T): T => {
    res.headers.set('Server-Timing', serverTiming(medicion));
    return res;
  };

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname === '/forgot-password';
  const isAdminRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  const isPublicRoute = pathname === '/' || isAuthRoute || pathname === '/reset-password';

  if (!user && isAdminRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return { response: conTiming(NextResponse.redirect(redirectUrl)), user: null };
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    return { response: conTiming(NextResponse.redirect(redirectUrl)), user };
  }

  void isPublicRoute;

  return { response: conTiming(supabaseResponse), user };
}
