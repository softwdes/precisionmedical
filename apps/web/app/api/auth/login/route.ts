import { NextResponse, type NextRequest } from 'next/server';
import { iniciarSesionEnServidor } from '@precision-medical/auth/login-servidor';
import { claveDeIp, contextoDe, frenoIp, vieneDeNuestrasPantallas } from '@precision-medical/auth/freno-ip';

/**
 * POST /api/auth/login — la puerta de entrada del Admin, del lado del servidor.
 *
 * ── Por qué el Admin primero y no las cinco a la vez ───────────────────────
 *
 * Porque esto es el único camino por el que entra todo el mundo, y si sale mal
 * el síntoma es "nadie puede trabajar". El Admin es el lugar correcto para
 * empezar: **no tiene paso de segundo factor hoy**, así que no hay dos cosas
 * moviéndose a la vez; lo usan 3 cuentas, no 30; y Erick lo abre todos los días,
 * así que la prueba es inmediata.
 *
 * Las otras cuatro se mudan DESPUÉS de verlo funcionando acá. El módulo
 * compartido (`@precision-medical/auth/login-servidor`) ya está escrito para
 * las cinco: lo que falta no es código, es la pantalla mirada.
 *
 * ── El freno es más estricto que el de `lockout` ───────────────────────────
 *
 * 10 por IP cada 10 minutos. Acá cada intento cuesta una verificación real de
 * contraseña contra Supabase, así que es la ruta más cara que exponemos y la
 * más golosa para quien prueba combinaciones.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!vieneDeNuestrasPantallas(req.headers)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const freno = frenoIp(claveDeIp(req.headers, 'login'), { max: 10, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json(
      { error: 'TOO_MANY' },
      { status: 429, headers: { 'Retry-After': String(freno.reintentarEnSeg) } },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !body.password) {
    return NextResponse.json({ error: 'MISSING_CREDENTIALS' }, { status: 400 });
  }

  const r = await iniciarSesionEnServidor(email, body.password, contextoDe(req.headers, 'admin'));

  /*
   * Siempre 200, también cuando la contraseña está mal.
   *
   * Un 401 acá no agrega nada —la pantalla ya lee `ok`— y en cambio llena los
   * registros de Vercel de errores que no son errores del sistema, que es como
   * se deja de mirar el panel de errores.
   */
  return NextResponse.json(r);
}
