import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: CookieOptions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.cookies.set(name as any, value as any);
          response = NextResponse.next({ request });
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        },
        remove(name: string, options: CookieOptions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.cookies.set(name as any, '' as any);
          response = NextResponse.next({ request });
          response.cookies.set(name, '', options as Parameters<typeof response.cookies.set>[2]);
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.png$).*)'],
};
