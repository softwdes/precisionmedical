import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';
import { cookieDeStaging, passwordCorrecta, destinoSeguro } from '@/lib/staging-gate';

const STAGING_PW = process.env.STAGING_PASSWORD;
const COOKIE     = 'pm_stg';

export async function POST(req: NextRequest) {
  if (!STAGING_PW) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Sin un tope, la contraseña compartida se puede probar sin límite. 10 intentos
  // cada 10 minutos por IP: de sobra para quien se equivoca al tipear.
  const freno = rateLimit(claveDeIp(req, 'staging-auth'), { max: 10, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return new NextResponse('Too many attempts', { status: 429, headers: cabeceras429(freno) });
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

  if (await passwordCorrecta(password, STAGING_PW)) {
    // Solo una ruta de ESTE sitio: un `callbackUrl` absoluto sacaba al usuario,
    // ya autenticado, a la página de un tercero.
    const res = NextResponse.redirect(new URL(destinoSeguro(callbackUrl), req.url));
    // La cookie lleva un hash derivado, no la contraseña.
    res.cookies.set(COOKIE, await cookieDeStaging(STAGING_PW), {
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
