/**
 * GET  /api/auth/lockout?email=...  — ¿esta cuenta está cerrada?
 * POST /api/auth/lockout            — registra un intento (bueno o malo).
 *
 * Gemelo del de las otras cuatro apps. Toda la política vive en
 * `@precision-medical/auth/lockout`: 3 intentos y la cuenta queda cerrada hasta
 * la medianoche de la clínica.
 *
 * ── Por qué el import es por subpath y no por el índice ─────────────────────
 *
 * `@precision-medical/auth` (el índice) arrastra módulos que usan Prisma, y
 * timeclock no tiene ni la dependencia de base ni `DATABASE_URL`. Importando
 * `/lockout` entra solo este módulo, que habla con el Admin por REST.
 *
 * Esa era exactamente la razón por la que timeclock no tenía candado: la
 * política estaba atada a Prisma. Ahora no lo está.
 *
 * ⚠️ Necesita `SUPABASE_SERVICE_ROLE_KEY` en el proyecto de timeclock en
 * Vercel. Sin esa variable el módulo lo dice en los logs con el prefijo
 * `[candado]` y responde "cuenta abierta" — o sea: **la pantalla funciona pero
 * no hay candado**. Es a propósito (ver el fail-open documentado allá), pero
 * conviene saberlo porque es un silencio fácil de confundir con "anda bien".
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '@precision-medical/auth/lockout';

function ipDelPedido(req: NextRequest): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get('email')?.trim();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  return NextResponse.json(await checkLockout(email));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { email?: string; success?: boolean };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const ip = ipDelPedido(req);
  if (body.success) await recordSuccessfulLogin(body.email, ip);
  else await recordFailedAttempt(body.email, ip);

  return NextResponse.json({ ok: true });
}
