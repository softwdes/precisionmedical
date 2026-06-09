import { NextRequest, NextResponse } from 'next/server';

const STAGING_PW = process.env.STAGING_PASSWORD;
const COOKIE     = 'pm_stg';

export async function POST(req: NextRequest) {
  if (!STAGING_PW) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  let password    = '';
  let callbackUrl = '/';

  try {
    const form  = await req.formData();
    password    = (form.get('password')    as string) ?? '';
    callbackUrl = (form.get('callbackUrl') as string) ?? '/';
  } catch {
    // formData parse failed
  }

  if (password === STAGING_PW) {
    const destination = decodeURIComponent(callbackUrl) || '/';
    const res = NextResponse.redirect(new URL(destination, req.url));
    res.cookies.set(COOKIE, STAGING_PW, {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 7,
      path:     '/',
    });
    return res;
  }

  const loginUrl = new URL(req.url);
  loginUrl.pathname = '/';
  loginUrl.searchParams.set('error', '1');
  return NextResponse.redirect(loginUrl);
}
