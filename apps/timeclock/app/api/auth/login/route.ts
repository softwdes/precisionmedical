import { NextResponse, type NextRequest } from 'next/server';
import { iniciarSesionEnServidor } from '@precision-medical/auth/login-servidor';
import { claveDeIp, contextoDe, frenoIp, vieneDeNuestrasPantallas } from '@precision-medical/auth/freno-ip';

/**
 * POST /api/auth/login — la autenticación ocurre en el SERVIDOR.
 *
 * ── Qué arregla ────────────────────────────────────────────────────────────
 *
 * Hasta hoy esta pantalla le hablaba directo a Supabase desde el navegador y
 * después le AVISABA a nuestra API si había fallado. Todo el candado colgaba de
 * esa confesión:
 *
 *  · quien ataca puede **no avisar** — prueba contraseñas sin gastar intentos;
 *  · quien ataca puede **avisar de más** — declara fallos ajenos y traba
 *    cuentas (tapado el 2026-10-05 con el freno por IP y el chequeo de origen,
 *    pero tapado no es cerrado: las dos cosas se falsifican).
 *
 * Ahora el servidor intenta la contraseña él mismo y cuenta lo que vio. Ya no
 * hay nada que creerle a nadie.
 *
 * El segundo factor sigue resolviéndose en la pantalla, con la sesión que esta
 * ruta deja abierta: acá se dice SI hace falta y con qué factor seguir.
 *
 * El Time Clock es el único al que entra casi todo el personal, y el único
 * donde quedarse afuera significa no poder fichar. Si algo de esto falla, el
 * síntoma es "nadie puede marcar entrada": mirar primero acá.
 *
 * ── El freno es más estricto que el de `lockout` ───────────────────────────
 *
 * 10 por IP cada 10 minutos. Cada intento acá cuesta una verificación real de
 * contraseña contra Supabase: es la ruta más cara que exponemos y la más golosa
 * para quien prueba combinaciones.
 */
const MODULO = 'timeclock';

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

  const r = await iniciarSesionEnServidor(email, body.password, contextoDe(req.headers, MODULO));

  /*
   * Siempre 200, también cuando la contraseña está mal.
   *
   * Un 401 acá no agrega nada —la pantalla ya lee `ok`— y en cambio llena los
   * registros de Vercel de errores que no son errores del sistema, que es como
   * se deja de mirar el panel de errores.
   */
  return NextResponse.json(r);
}
