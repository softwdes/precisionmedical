/**
 * GET  /api/auth/lockout?email=...  — ¿esta cuenta está cerrada?
 * POST /api/auth/lockout            — registra un intento (bueno o malo).
 *
 * Gemelo del de las otras cuatro apps. Toda la política vive en
 * `@precision-medical/auth/lockout`: 3 intentos y la cuenta queda cerrada hasta
 * la medianoche de la clínica.
 *
 * ── Por qué el Admin no tenía candado hasta hoy ────────────────────────────
 *
 * Porque la política estaba escrita contra Prisma, que acá apunta a Phoenix —
 * la base clínica— y el Admin trabaja contra su propio proyecto. Desde el
 * 2026-10-03 el candado vive en la tabla `users` del Admin, que es donde está
 * la cuenta, y se escribe por REST: el mismo camino que ya usa
 * `api/auth/record-login`, que es el vecino de esta carpeta.
 *
 * El import va por el subpath `/lockout` y no por el índice del paquete para
 * no arrastrar los módulos que sí usan Prisma.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '@precision-medical/auth/lockout';
import { claveDeIp, contextoDe, frenoIp, vieneDeNuestrasPantallas } from '@precision-medical/auth/freno-ip';

/**
 * ⚠️ ESTA RUTA ESTUVO ABIERTA A INTERNET. Lo que sigue es lo que la cierra.
 *
 * Medido el 2026-10-05 contra producción: un POST sin autenticación con el
 * correo de cualquiera y `success:false` devolvía 200 y sumaba un intento
 * fallido. Tres de esos y esa persona quedaba afuera de las CINCO apps hasta la
 * medianoche. Treinta correos conocidos = la clínica parada un día, sin una
 * sola contraseña.
 *
 * Ahora:
 *  1. **Freno por IP** — ver `@precision-medical/auth/freno-ip`.
 *  2. **Origen propio** — se rechaza lo que no venga de una de nuestras
 *     pantallas. Se falsifica, pero corta en seco al script genérico.
 *  3. Todo intento queda con IP, país, ciudad, navegador y módulo.
 *
 * El freno del GET es más holgado que el del POST: consultar si una cuenta está
 * trabada no hace daño; declarar un fallo, sí.
 *
 * **Esto NO es el arreglo completo**, y conviene no creer que lo es: mientras el
 * navegador sea quien avisa "falló", alguien puede mentir. El arreglo de fondo
 * es que el login ocurra en el servidor.
 */
const MODULO = 'admin';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const frenoGet = frenoIp(claveDeIp(req.headers, 'lockout-get'), { max: 30, ventanaMs: 10 * 60_000 });
  if (!frenoGet.ok) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429, headers: { 'Retry-After': String(frenoGet.reintentarEnSeg) } });
  }

  const email = req.nextUrl.searchParams.get('email')?.trim();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  return NextResponse.json(await checkLockout(email));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Sin navegador propio del otro lado no se registra nada. Es la línea que
  // vuelve caro el ataque de "trabar cuentas ajenas" desde un script.
  if (!vieneDeNuestrasPantallas(req.headers)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const freno = frenoIp(claveDeIp(req.headers, 'lockout-post'), { max: 8, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429, headers: { 'Retry-After': String(freno.reintentarEnSeg) } });
  }

  const body = (await req.json()) as { email?: string; success?: boolean };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const ctx = contextoDe(req.headers, MODULO);
  if (body.success) {
    await recordSuccessfulLogin(body.email, ctx);
    return NextResponse.json({ ok: true });
  }

  // El resultado vuelve a la pantalla para que pueda AVISAR cuántos intentos
  // quedan. Antes era un `{ ok: true }` mudo y por eso nadie se enteraba de
  // que iba por el segundo de tres.
  return NextResponse.json({ ok: true, ...(await recordFailedAttempt(body.email, ctx)) });
}
