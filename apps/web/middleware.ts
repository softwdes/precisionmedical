import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@precision-medical/auth/middleware';

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

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Set locale on the request BEFORE updateSession so Next.js forwards it to
  // server components (i18n/request.ts reads cookies() from the incoming request,
  // not from the outgoing response — both must be set to work on first visit).
  let detectedLocale: 'es' | 'en' | null = null;
  if (!request.cookies.get('locale')) {
    detectedLocale = detectLocaleFromHeader(request);
    request.cookies.set('locale', detectedLocale);
  }

  const response = await updateSession(request);

  if (detectedLocale) {
    response.cookies.set('locale', detectedLocale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
